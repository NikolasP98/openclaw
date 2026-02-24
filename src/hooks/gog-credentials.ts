/**
 * Google OAuth credential storage manager
 * Handles per-session credential isolation with token refresh
 */

import fs from "fs/promises";
import fsSync from "node:fs";
import os from "os";
import path from "path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { extractGogClientCredentials } from "./gmail-setup-utils.js";
import type { CredentialResult, GogCredentials, TokenRefreshResponse } from "./gog-oauth-types.js";

const log = createSubsystemLogger("gog-credentials");

// ── Config-based Google client credentials ──────────────────────────

/** Google OAuth client type — determines allowed redirect URIs */
export type GoogleClientType = "installed" | "web" | "unknown";

/** Parsed client credentials from the config-specified JSON file */
let configClientCredentials: {
  clientId: string;
  clientSecret: string;
  clientType: GoogleClientType;
} | null = null;

/**
 * Set the path to the Google client credentials JSON file (from config).
 * Called once during gateway startup if `hooks.gogOAuth.googleClientCredentialsFile` is set.
 * The file format matches the Google Cloud Console download (supports "installed" and "web" types).
 */
export function setGoogleClientCredentialsFile(filePath: string): void {
  try {
    const raw = fsSync.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Support both "installed" and "web" application types
    const installed = parsed.installed as Record<string, unknown> | undefined;
    const web = parsed.web as Record<string, unknown> | undefined;
    const source = installed ?? web ?? parsed;
    const clientType: GoogleClientType = installed ? "installed" : web ? "web" : "unknown";

    const clientId = source.client_id;
    const clientSecret = source.client_secret;
    if (
      typeof clientId === "string" &&
      typeof clientSecret === "string" &&
      clientId &&
      clientSecret
    ) {
      configClientCredentials = { clientId, clientSecret, clientType };
      log.info(`Loaded Google client credentials from config: ${filePath} (type: ${clientType})`);
    } else {
      log.warn(`Config file ${filePath} exists but does not contain valid client_id/client_secret`);
    }
  } catch (err) {
    log.warn(`Failed to read Google client credentials file: ${filePath}: ${String(err)}`);
  }
}

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
    const errorBody = await response.text();
    let parsed: { error?: string; error_description?: string } = {};
    try {
      parsed = JSON.parse(errorBody);
    } catch {
      // not JSON
    }

    if (parsed.error === "invalid_grant") {
      throw new Error(
        `Google OAuth refresh failed: invalid_grant — ${parsed.error_description || "token expired or revoked"}.\n` +
          "Common causes:\n" +
          "  - OAuth consent screen is in 'Testing' mode (tokens expire after 7 days)\n" +
          "  - User revoked access in Google Account settings\n" +
          "  - Token was already used or replaced\n" +
          "Fix: Re-authenticate with the gog-auth-start tool. If tokens keep expiring after 7 days,\n" +
          "move your OAuth consent screen from Testing to Production in Google Cloud Console.",
      );
    }

    throw new Error(
      `Failed to refresh Google OAuth token (${response.status}): ${parsed.error_description || parsed.error || errorBody}`,
    );
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
 * Get valid credentials, refreshing if necessary.
 * Returns a discriminated CredentialResult so callers can distinguish
 * "no credentials" from "refresh failed" and surface actionable errors.
 */
export async function getValidCredentials(
  agentId: string,
  sessionKey: string,
  email?: string,
): Promise<CredentialResult> {
  const credentials = await loadSessionCredentials(agentId, sessionKey, email);

  if (!credentials) {
    return {
      credentials: null,
      error: "No Google credentials found for this session",
      refreshFailed: false,
    };
  }

  // Refresh if expired
  if (isTokenExpired(credentials)) {
    try {
      const refreshed = await refreshAccessToken(credentials);
      return { credentials: refreshed };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log.warn(`Token refresh failed: ${msg}`);
      return { credentials: null, error: msg, refreshFailed: true };
    }
  }

  return { credentials };
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
  // 1. Config file (hooks.gogOAuth.googleClientCredentialsFile)
  if (configClientCredentials) {
    return configClientCredentials.clientId;
  }
  // 2. Environment variable
  if (process.env.GOOGLE_CLIENT_ID) {
    return process.env.GOOGLE_CLIENT_ID;
  }
  // 3. gog CLI credentials file (~/.config/gogcli/credentials.json)
  const fileCreds = getFileCredentials();
  if (fileCreds) {
    return fileCreds.clientId;
  }
  throw new Error(
    "Google OAuth client ID not found. Checked (in order):\n" +
      "  1. hooks.gogOAuth.googleClientCredentialsFile in minion.json\n" +
      "  2. GOOGLE_CLIENT_ID environment variable\n" +
      "  3. ~/.config/gogcli/credentials.json\n" +
      "Set one of these to your Google Cloud Console OAuth client credentials.",
  );
}

/**
 * Get Google OAuth client secret.
 * Priority: env var GOOGLE_CLIENT_SECRET > gog CLI credentials.json file
 */
export function getGoogleClientSecret(): string {
  // 1. Config file (hooks.gogOAuth.googleClientCredentialsFile)
  if (configClientCredentials) {
    return configClientCredentials.clientSecret;
  }
  // 2. Environment variable
  if (process.env.GOOGLE_CLIENT_SECRET) {
    return process.env.GOOGLE_CLIENT_SECRET;
  }
  // 3. gog CLI credentials file (~/.config/gogcli/credentials.json)
  const fileCreds = getFileCredentials();
  if (fileCreds) {
    return fileCreds.clientSecret;
  }
  throw new Error(
    "Google OAuth client secret not found. Checked (in order):\n" +
      "  1. hooks.gogOAuth.googleClientCredentialsFile in minion.json\n" +
      "  2. GOOGLE_CLIENT_SECRET environment variable\n" +
      "  3. ~/.config/gogcli/credentials.json\n" +
      "Set one of these to your Google Cloud Console OAuth client credentials.",
  );
}

/**
 * Get the detected Google OAuth client type from the credentials file.
 * Returns "unknown" if no credentials file was loaded or type couldn't be determined.
 */
export function getGoogleClientType(): GoogleClientType {
  return configClientCredentials?.clientType ?? "unknown";
}

/**
 * Import OAuth tokens into the gog CLI keyring.
 * Core sync logic — writes a temp token file, runs `gog auth tokens import`, cleans up.
 * Caller is responsible for ensuring gog is installed and available.
 *
 * @param credentials - The OAuth credentials to import
 * @param env - Optional environment override (e.g. with GOG_KEYRING_BACKEND/PASSWORD).
 *              Defaults to process.env if not provided.
 * @returns Result indicating success or failure with error detail
 */
export async function importTokensToGogKeyring(
  credentials: GogCredentials,
  env?: NodeJS.ProcessEnv,
): Promise<{ success: boolean; error?: string }> {
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
      ["gog", "auth", "tokens", "import", tmpFile, "--account", credentials.email],
      { timeoutMs: 10_000, env },
    );
    if (result.code === 0) {
      log.info(`Synced tokens to gog CLI keyring for ${credentials.email}`);
      return { success: true };
    } else {
      const detail = result.stderr || result.stdout;
      log.warn(`gog auth tokens import failed (code=${result.code}): ${detail}`);
      return { success: false, error: `exit code ${result.code}: ${detail}` };
    }
  } finally {
    try {
      fsSync.unlinkSync(tmpFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

/**
 * Sync OAuth tokens to gog CLI keyring so `gog gmail ...` commands work.
 * Best-effort: logs errors but never throws. Returns result so callers can
 * surface warnings to the user.
 */
export async function syncToGogKeyring(
  credentials: GogCredentials,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if gog binary is available
    const gogCheck = await runCommandWithTimeout(["which", "gog"], { timeoutMs: 2_000 });
    if (gogCheck.code !== 0) {
      return { success: false, error: "gog CLI not installed" };
    }

    // Verify gog version supports `auth tokens` (plural, requires >= v0.11.0)
    const versionCheck = await runCommandWithTimeout(["gog", "--version"], { timeoutMs: 3_000 });
    if (versionCheck.code === 0) {
      const match = versionCheck.stdout.match(/v(\d+)\.(\d+)\.(\d+)/);
      if (match) {
        const [, major, minor] = match.map(Number);
        if (major === 0 && minor < 11) {
          const msg = `gog CLI v${major}.${minor} is too old for 'auth tokens import' (requires >= v0.11.0)`;
          log.warn(`${msg}. Skipping keyring sync.`);
          return { success: false, error: msg };
        }
      }
    }

    return await importTokensToGogKeyring(credentials);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[gog-credentials] Failed to sync tokens to gog CLI keyring:", error);
    return { success: false, error: msg };
  }
}
