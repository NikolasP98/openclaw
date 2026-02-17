/**
 * Google OAuth credential storage manager
 * Handles per-session credential isolation with token refresh
 */

import fs from "fs/promises";
import fsSync from "node:fs";
import os from "os";
import path from "path";
import type { GogCredentials, TokenRefreshResponse } from "./gog-oauth-types.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { extractGogClientCredentials } from "./gmail-setup-utils.js";

/**
 * Get the credentials directory for an agent
 */
export function getCredentialsDir(agentId: string): string {
  const homeDir = os.homedir();
  return path.join(homeDir, ".minion", "agents", agentId, "gog-credentials");
}

/**
 * Get the credentials file path for a session
 */
export function getCredentialsPath(agentId: string, sessionKey: string, email: string): string {
  const dir = getCredentialsDir(agentId);
  // Sanitize sessionKey and email for filesystem
  const safeSessionKey = sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeEmail = email.replace(/[^a-zA-Z0-9@._-]/g, "_");
  return path.join(dir, `${safeSessionKey}_${safeEmail}.json`);
}

/**
 * Ensure credentials directory exists
 */
async function ensureCredentialsDir(agentId: string): Promise<void> {
  const dir = getCredentialsDir(agentId);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}

/**
 * Load session credentials if they exist
 * Falls back to checking global gogcli credentials if no session credentials found
 */
export async function loadSessionCredentials(
  agentId: string,
  sessionKey: string,
  email?: string,
): Promise<GogCredentials | null> {
  try {
    // If email is provided, try to load specific credentials
    if (email) {
      const credPath = getCredentialsPath(agentId, sessionKey, email);
      try {
        const data = await fs.readFile(credPath, "utf-8");
        const creds: GogCredentials = JSON.parse(data);
        creds.filePath = credPath;
        return creds;
      } catch {
        // File doesn't exist or is invalid, continue to search
      }
    }

    // Search for any credentials file for this session
    const dir = getCredentialsDir(agentId);
    const safeSessionKey = sessionKey.replace(/[^a-zA-Z0-9_-]/g, "_");
    const pattern = `${safeSessionKey}_`;

    try {
      const files = await fs.readdir(dir);
      const matchingFiles = files.filter((f) => f.startsWith(pattern));

      if (matchingFiles.length > 0) {
        // Load the first matching credentials file
        const credPath = path.join(dir, matchingFiles[0]);
        const data = await fs.readFile(credPath, "utf-8");
        const creds: GogCredentials = JSON.parse(data);
        creds.filePath = credPath;
        return creds;
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    // No session credentials found - gogcli will fall back to its own global credentials
    return null;
  } catch (error) {
    console.error("Error loading session credentials:", error);
    return null;
  }
}

/**
 * Save credentials with secure file permissions (0600)
 */
export async function saveSessionCredentials(credentials: GogCredentials): Promise<string> {
  await ensureCredentialsDir(credentials.agentId);

  const credPath = getCredentialsPath(
    credentials.agentId,
    credentials.sessionKey,
    credentials.email,
  );

  // Write atomically with secure permissions
  const data = JSON.stringify(credentials, null, 2);
  await fs.writeFile(credPath, data, { mode: 0o600 });

  return credPath;
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(credentials: GogCredentials): Promise<GogCredentials> {
  // Call Google OAuth token refresh endpoint
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const tokenData: TokenRefreshResponse = await response.json();

  // Update credentials with new access token
  const updatedCredentials: GogCredentials = {
    ...credentials,
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };

  // Save updated credentials
  await saveSessionCredentials(updatedCredentials);

  return updatedCredentials;
}

/**
 * Check if access token is expired or about to expire (within 5 minutes)
 */
export function isTokenExpired(credentials: GogCredentials): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() >= credentials.expiresAt - bufferMs;
}

/**
 * Get valid credentials, refreshing if necessary
 */
export async function getValidCredentials(
  agentId: string,
  sessionKey: string,
  email?: string,
): Promise<GogCredentials | null> {
  const credentials = await loadSessionCredentials(agentId, sessionKey, email);

  if (!credentials) {
    return null;
  }

  // Refresh if expired
  if (isTokenExpired(credentials)) {
    try {
      return await refreshAccessToken(credentials);
    } catch (error) {
      console.error("Failed to refresh token:", error);
      // Return null so caller can prompt for re-authentication
      return null;
    }
  }

  return credentials;
}

/**
 * Revoke credentials with Google and delete local file
 */
export async function revokeCredentials(
  agentId: string,
  sessionKey: string,
  email?: string,
): Promise<void> {
  const credentials = await loadSessionCredentials(agentId, sessionKey, email);

  if (!credentials) {
    return; // Nothing to revoke
  }

  // Revoke token with Google
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${credentials.refreshToken || credentials.accessToken}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
  } catch (error) {
    console.error("Failed to revoke token with Google:", error);
    // Continue to delete local file even if revocation fails
  }

  // Delete local credentials file
  if (credentials.filePath) {
    try {
      await fs.unlink(credentials.filePath);
    } catch (error) {
      console.error("Failed to delete credentials file:", error);
    }
  }
}

/**
 * List all credentials files for an agent
 */
export async function listCredentials(agentId: string): Promise<GogCredentials[]> {
  const dir = getCredentialsDir(agentId);
  const credentials: GogCredentials[] = [];

  try {
    const files = await fs.readdir(dir);

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const credPath = path.join(dir, file);
          const data = await fs.readFile(credPath, "utf-8");
          const creds: GogCredentials = JSON.parse(data);
          creds.filePath = credPath;
          credentials.push(creds);
        } catch (error) {
          console.error(`Failed to load credentials file ${file}:`, error);
        }
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return credentials;
}

/** Cached credentials extracted from gog CLI JSON file */
let cachedFileCredentials: { clientId: string; clientSecret: string } | null | undefined;

function getFileCredentials(): { clientId: string; clientSecret: string } | null {
  if (cachedFileCredentials !== undefined) {
    return cachedFileCredentials;
  }
  cachedFileCredentials = extractGogClientCredentials();
  return cachedFileCredentials;
}

/**
 * Get Google OAuth client ID.
 * Priority: env var GOOGLE_CLIENT_ID > gog CLI credentials.json file
 */
export function getGoogleClientId(): string {
  if (process.env.GOOGLE_CLIENT_ID) {
    return process.env.GOOGLE_CLIENT_ID;
  }
  const fileCreds = getFileCredentials();
  if (fileCreds) {
    return fileCreds.clientId;
  }
  throw new Error(
    "GOOGLE_CLIENT_ID not set and no gog CLI credentials.json found. " +
      "Set the env var or place credentials in ~/.config/gogcli/credentials.json",
  );
}

/**
 * Get Google OAuth client secret.
 * Priority: env var GOOGLE_CLIENT_SECRET > gog CLI credentials.json file
 */
export function getGoogleClientSecret(): string {
  if (process.env.GOOGLE_CLIENT_SECRET) {
    return process.env.GOOGLE_CLIENT_SECRET;
  }
  const fileCreds = getFileCredentials();
  if (fileCreds) {
    return fileCreds.clientSecret;
  }
  throw new Error(
    "GOOGLE_CLIENT_SECRET not set and no gog CLI credentials.json found. " +
      "Set the env var or place credentials in ~/.config/gogcli/credentials.json",
  );
}

/**
 * Sync OAuth tokens to gog CLI keyring so `gog gmail ...` commands work.
 * Best-effort: logs errors but never throws.
 */
export async function syncToGogKeyring(credentials: GogCredentials): Promise<void> {
  try {
    // Check if gog binary is available
    const gogCheck = await runCommandWithTimeout(["which", "gog"], { timeoutMs: 2_000 });
    if (gogCheck.code !== 0) {
      return; // gog CLI not installed, skip silently
    }

    // Write a temporary token file in gog CLI's expected snake_case format
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `gog-token-import-${Date.now()}.json`);
    const tokenData = {
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      token_type: "Bearer",
      expiry: new Date(credentials.expiresAt).toISOString(),
    };

    fsSync.writeFileSync(tmpFile, JSON.stringify(tokenData, null, 2), { mode: 0o600 });

    try {
      const result = await runCommandWithTimeout(
        ["gog", "auth", "token", "import", tmpFile, "--account", credentials.email],
        { timeoutMs: 10_000 },
      );
      if (result.code === 0) {
        console.log(`[gog-credentials] Synced tokens to gog CLI keyring for ${credentials.email}`);
      } else {
        console.warn(
          `[gog-credentials] gog auth token import failed (code=${result.code}): ${result.stderr || result.stdout}`,
        );
      }
    } finally {
      // Clean up temp file
      try {
        fsSync.unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }
    }
  } catch (error) {
    console.warn("[gog-credentials] Failed to sync tokens to gog CLI keyring:", error);
  }
}
