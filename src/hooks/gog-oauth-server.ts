/**
 * OAuth callback server for non-blocking Google authentication
 * Handles localhost OAuth redirects and delegates token exchange
 * and credential storage to the AuthProvider.
 */

import crypto from "crypto";
import http from "http";
import { URL } from "url";
import { createGoogleAuthProvider } from "../auth/google/google-auth-provider.js";
import type { AuthProvider } from "../auth/provider.js";
import { updateSessionStore, resolveDefaultSessionStorePath } from "../config/sessions.js";
import { upsertSharedEnvVar } from "../infra/env-file.js";
import { logAcceptedEnvOption } from "../infra/env.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { runCommandWithTimeout } from "../platform/process/exec.js";
import { getGoogleClientType, setGoogleClientCredentialsFile } from "./gog-credentials.js";
import {
  notifyAuthSuccess,
  notifyAuthError,
  notifyAuthTimeout,
} from "./gog-oauth-notifications.js";
import type {
  OAuthServerConfig,
  PendingOAuthFlow,
  OAuthCallbackParams,
} from "./gog-oauth-types.js";

const log = createSubsystemLogger("gog-oauth");

/**
 * Default OAuth server configuration
 */
const DEFAULT_CONFIG: Required<
  Omit<OAuthServerConfig, "externalRedirectUri" | "googleClientCredentialsFile">
> = {
  enabled: true,
  port: 51234,
  bind: "127.0.0.1",
  callbackPath: "/oauth-callback",
  timeoutMinutes: 5,
};

/**
 * In-memory storage for pending OAuth flows
 * Key: state token, Value: flow data
 */
const pendingFlows = new Map<string, PendingOAuthFlow>();

/**
 * Server instance
 */
let server: http.Server | null = null;
let actualPort: number | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;
let configuredExternalRedirectUri: string | undefined;

/**
 * Get the redirect URI for OAuth flows.
 * Desktop ("installed") clients only support localhost redirects -- Google rejects
 * external URIs with redirect_uri_mismatch. When a Desktop client is detected,
 * we always return the localhost URI regardless of env/config settings.
 * For "web" or "unknown" clients: env var > config > localhost fallback.
 */
export function getRedirectUri(): string {
  const localhostUri = `http://localhost:${actualPort ?? DEFAULT_CONFIG.port}${DEFAULT_CONFIG.callbackPath}`;
  const clientType = getGoogleClientType();

  if (clientType === "installed") {
    const envUri = process.env.MINION_GOG_OAUTH_REDIRECT_URI;
    const externalUri = envUri || configuredExternalRedirectUri;
    if (externalUri) {
      log.warn(
        `Desktop client detected — ignoring external redirect URI "${externalUri}" ` +
          `(installed clients only support localhost redirects). Using: ${localhostUri}`,
      );
    }
    return localhostUri;
  }

  const envUri = process.env.MINION_GOG_OAUTH_REDIRECT_URI;
  if (envUri) {
    return envUri;
  }
  if (configuredExternalRedirectUri) {
    return configuredExternalRedirectUri;
  }
  return localhostUri;
}

/**
 * Generate cryptographic state token for CSRF protection
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Add a pending OAuth flow
 */
export function addPendingFlow(flow: PendingOAuthFlow): void {
  pendingFlows.set(flow.state, flow);
}

/**
 * Get a pending OAuth flow by state
 */
export function getPendingFlow(state: string): PendingOAuthFlow | undefined {
  return pendingFlows.get(state);
}

/**
 * Remove a pending OAuth flow
 */
export function removePendingFlow(state: string): void {
  pendingFlows.delete(state);
}

/**
 * Clean up expired OAuth flows
 */
function cleanupExpiredFlows(): void {
  const now = Date.now();
  const expired: string[] = [];

  for (const [state, flow] of pendingFlows.entries()) {
    if (now > flow.expiresAt) {
      expired.push(state);

      // Notify user of timeout
      notifyAuthTimeout(flow.sessionKey, flow.agentId, flow.email).catch((err) => {
        log.error(`Failed to send timeout notification: ${String(err)}`);
      });
    }
  }

  for (const state of expired) {
    pendingFlows.delete(state);
  }
}

/**
 * Resolve the appropriate AuthProvider for a pending flow.
 * Currently only Google is supported; future providers can be dispatched
 * based on flow.providerId.
 */
function resolveProvider(_flow: PendingOAuthFlow): AuthProvider {
  return createGoogleAuthProvider();
}

/**
 * Handle OAuth callback request
 */
async function handleCallback(
  params: OAuthCallbackParams,
): Promise<{ status: number; message: string }> {
  // Check for error from Google
  if (params.error) {
    const state = params.state;
    if (state) {
      const flow = getPendingFlow(state);
      if (flow) {
        removePendingFlow(state);
        await notifyAuthError(flow.sessionKey, flow.agentId, flow.email, params.error);
      }
    }

    return {
      status: 400,
      message: `Authorization failed: ${params.error_description || params.error}`,
    };
  }

  // Validate required parameters
  if (!params.code || !params.state) {
    return {
      status: 400,
      message: "Missing code or state parameter",
    };
  }

  // Validate state (CSRF protection)
  const flow = getPendingFlow(params.state);
  if (!flow) {
    log.warn(`Invalid or expired state token: ${params.state}`);
    return {
      status: 400,
      message: "Invalid or expired authorization request",
    };
  }

  // Check expiry
  if (Date.now() > flow.expiresAt) {
    removePendingFlow(params.state);
    await notifyAuthTimeout(flow.sessionKey, flow.agentId, flow.email);
    return {
      status: 400,
      message: "Authorization request expired (5 minutes)",
    };
  }

  // Remove flow (one-time use)
  removePendingFlow(params.state);

  try {
    // Delegate token exchange and credential storage to the provider
    const provider = resolveProvider(flow);
    const redirectUri = getRedirectUri();
    const tokens = await provider.exchangeCode(params.code, redirectUri);

    const credPath = await provider.storeCredentials({
      tokens,
      email: flow.email,
      services: flow.services,
      sessionKey: flow.sessionKey,
      agentId: flow.agentId,
    });

    // Update session entry
    const storePath = resolveDefaultSessionStorePath(flow.agentId);
    await updateSessionStore(storePath, (store) => {
      const session = store[flow.sessionKey];
      if (session) {
        session.gogCredentialsFile = credPath;
        session.gogAuthEmail = flow.email;
        delete session.gogAuthPending;
        session.updatedAt = Date.now();
      }
    });

    // Notify user of success
    await notifyAuthSuccess(flow.sessionKey, flow.agentId, flow.email, flow.services);

    return {
      status: 200,
      message: "Authentication successful! You can close this window.",
    };
  } catch (error) {
    log.error(`Token exchange error: ${error instanceof Error ? error.message : String(error)}`);
    await notifyAuthError(
      flow.sessionKey,
      flow.agentId,
      flow.email,
      error instanceof Error ? error.message : "Unknown error",
    );

    return {
      status: 500,
      message: "Failed to complete authentication. Please try again.",
    };
  }
}

/** Build the HTML response page shown to the user after the OAuth callback. */
function buildCallbackHtml(result: { status: number; message: string }): string {
  const color = result.status === 200 ? "#10b981" : "#ef4444";
  const heading = result.status === 200 ? "Success" : "Error";
  return `<!DOCTYPE html><html><head><title>Google OAuth - Minion</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.c{background:#fff;padding:2rem;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,.1);text-align:center;max-width:400px}
h1{color:${color};margin-top:0}p{color:#6b7280;line-height:1.5}</style></head>
<body><div class="c"><h1>${heading}</h1><p>${result.message}</p></div></body></html>`;
}

/**
 * Handle HTTP request
 */
async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: Required<Omit<OAuthServerConfig, "externalRedirectUri" | "googleClientCredentialsFile">>,
): Promise<void> {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  // Health check endpoint
  if (url.pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("OK");
    return;
  }

  // OAuth callback endpoint
  if (url.pathname === config.callbackPath) {
    const params: OAuthCallbackParams = {
      code: url.searchParams.get("code") || undefined,
      state: url.searchParams.get("state") || undefined,
      error: url.searchParams.get("error") || undefined,
      error_description: url.searchParams.get("error_description") || undefined,
    };

    const result = await handleCallback(params);

    res.statusCode = result.status;
    res.setHeader("Content-Type", "text/html");
    res.end(buildCallbackHtml(result));
    return;
  }

  // 404 for other paths
  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain");
  res.end("Not Found");
}

/**
 * Try to start server on a specific port
 */
function tryStartServer(
  port: number,
  bind: string,
  config: Required<Omit<OAuthServerConfig, "externalRedirectUri" | "googleClientCredentialsFile">>,
): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      handleRequest(req, res, config).catch((err) => {
        log.error(`Request handler error: ${err instanceof Error ? err.message : String(err)}`);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
    });

    srv.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });

    srv.listen(port, bind, () => {
      resolve(srv);
    });
  });
}

/**
 * Register Google OAuth client credentials with the gog CLI keyring (best-effort).
 */
async function registerGogClientCredentials(credFile: string): Promise<void> {
  try {
    const gogCheck = await runCommandWithTimeout(["which", "gog"], { timeoutMs: 2_000 });
    if (gogCheck.code !== 0) {
      return;
    }
    const result = await runCommandWithTimeout(["gog", "auth", "credentials", credFile], {
      timeoutMs: 10_000,
    });
    if (result.code === 0) {
      log.info("Registered Google client credentials with gog CLI");
    } else {
      log.warn(
        `gog auth credentials failed (code=${result.code}): ${result.stderr || result.stdout}`,
      );
    }
  } catch (err) {
    log.warn(`Failed to register gog client credentials: ${String(err)}`);
  }
}

/**
 * Ensure GOG_KEYRING_BACKEND and GOG_KEYRING_PASSWORD are set in process.env
 * and persisted to ~/.minion/.env.
 */
function ensureGogKeyringEnv(): void {
  let dirty = false;

  if (!process.env.GOG_KEYRING_BACKEND) {
    process.env.GOG_KEYRING_BACKEND = "file";
    upsertSharedEnvVar({ key: "GOG_KEYRING_BACKEND", value: "file" });
    dirty = true;
  }

  if (!process.env.GOG_KEYRING_PASSWORD) {
    const password = crypto.randomBytes(32).toString("hex");
    process.env.GOG_KEYRING_PASSWORD = password;
    upsertSharedEnvVar({ key: "GOG_KEYRING_PASSWORD", value: password });
    dirty = true;
  }

  if (dirty) {
    log.info("Initialized GOG keyring credentials and persisted to .env");
  }
}

/**
 * Start the OAuth callback server with port fallback
 */
export async function startGogOAuthServer(
  config: Partial<OAuthServerConfig>,
  agentDir: string,
): Promise<{
  port: number;
  stop: () => Promise<void>;
}> {
  ensureGogKeyringEnv();

  // agentDir kept in signature for backward compatibility but no longer passed to handlers
  void agentDir;

  const { externalRedirectUri, googleClientCredentialsFile, ...rest } = config;
  const fullConfig: Required<
    Omit<OAuthServerConfig, "externalRedirectUri" | "googleClientCredentialsFile">
  > = {
    ...DEFAULT_CONFIG,
    ...rest,
  };

  // Store external redirect URI from config (env var takes priority in getRedirectUri)
  configuredExternalRedirectUri = externalRedirectUri;

  // Load Google client credentials: env var overrides config file
  const envCredFile = process.env.MINION_GOOGLE_CLIENT_CREDENTIALS_FILE;
  const credFile = envCredFile || googleClientCredentialsFile;
  if (envCredFile) {
    logAcceptedEnvOption({
      key: "MINION_GOOGLE_CLIENT_CREDENTIALS_FILE",
      description: "Google OAuth client credentials file",
    });
  }
  if (credFile) {
    setGoogleClientCredentialsFile(credFile);
    void registerGogClientCredentials(credFile);
  }

  if (!fullConfig.enabled) {
    throw new Error("OAuth server is disabled in configuration");
  }

  // Try ports from 51234 to 51239
  const ports = [fullConfig.port, 51235, 51236, 51237, 51238, 51239];
  let lastError: Error | null = null;

  for (const port of ports) {
    try {
      server = await tryStartServer(port, fullConfig.bind, fullConfig);
      actualPort = port;
      log.info(`Server listening on ${fullConfig.bind}:${port}`);

      // Start cleanup interval (every 60 seconds)
      cleanupInterval = setInterval(cleanupExpiredFlows, 60000);

      return {
        port,
        stop: async () => {
          if (cleanupInterval) {
            clearInterval(cleanupInterval);
            cleanupInterval = null;
          }

          return new Promise((resolve) => {
            if (server) {
              server.close(() => {
                server = null;
                actualPort = null;
                pendingFlows.clear();
                resolve();
              });
            } else {
              resolve();
            }
          });
        },
      };
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw new Error(
    `Failed to start OAuth server on any port (${ports.join(", ")}): ${lastError?.message}`,
  );
}

/**
 * Get the current server port (if running)
 */
export function getServerPort(): number | null {
  return actualPort;
}

/**
 * Check if server is running
 */
export function isServerRunning(): boolean {
  return server !== null;
}
