/**
 * OAuth callback server for non-blocking Google authentication
 * Handles localhost OAuth redirects and token exchange
 */

import http from "http";
import { URL } from "url";
import crypto from "crypto";
import type {
	OAuthServerConfig,
	PendingOAuthFlow,
	OAuthCallbackParams,
	TokenExchangeResponse,
	GogCredentials,
} from "./gog-oauth-types.js";
import { saveSessionCredentials } from "./gog-credentials.js";
import {
	notifyAuthSuccess,
	notifyAuthError,
	notifyAuthTimeout,
} from "./gog-oauth-notifications.js";
import { updateSessionStore } from "../config/sessions.js";

/**
 * Default OAuth server configuration
 */
const DEFAULT_CONFIG: Required<OAuthServerConfig> = {
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
			notifyAuthTimeout(flow.sessionKey, flow.agentId, flow.email).catch(
				(err) => {
					console.error("Failed to send timeout notification:", err);
				},
			);
		}
	}

	for (const state of expired) {
		pendingFlows.delete(state);
	}
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
	code: string,
	redirectUri: string,
): Promise<TokenExchangeResponse> {
	const clientId = process.env.GOOGLE_CLIENT_ID;
	const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		throw new Error(
			"GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set",
		);
	}

	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			code,
			client_id: clientId,
			client_secret: clientSecret,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Token exchange failed: ${error}`);
	}

	return await response.json();
}

/**
 * Handle OAuth callback request
 */
async function handleCallback(
	params: OAuthCallbackParams,
	agentDir: string,
): Promise<{ status: number; message: string }> {
	// Check for error from Google
	if (params.error) {
		const state = params.state;
		if (state) {
			const flow = getPendingFlow(state);
			if (flow) {
				removePendingFlow(state);
				await notifyAuthError(
					flow.sessionKey,
					flow.agentId,
					flow.email,
					params.error,
				);
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
		console.warn(
			`[gog-oauth] Invalid or expired state token: ${params.state}`,
		);
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
		// Exchange code for tokens
		const redirectUri = `http://localhost:${actualPort}${DEFAULT_CONFIG.callbackPath}`;
		const tokens = await exchangeCodeForTokens(params.code, redirectUri);

		// Create credentials object
		const credentials: GogCredentials = {
			email: flow.email,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token || "",
			expiresAt: Date.now() + tokens.expires_in * 1000,
			createdAt: Date.now(),
			sessionKey: flow.sessionKey,
			agentId: flow.agentId,
			services: flow.services,
		};

		// Save credentials
		const credPath = await saveSessionCredentials(credentials);

		// Update session entry
		await updateSessionStore(agentDir, (store) => {
			const session = store[flow.sessionKey];
			if (session) {
				session.gogCredentialsFile = credPath;
				session.gogAuthEmail = flow.email;
				delete session.gogAuthPending;
				session.updatedAt = Date.now();
			}
		});

		// Notify user of success
		await notifyAuthSuccess(
			flow.sessionKey,
			flow.agentId,
			flow.email,
			flow.services,
		);

		return {
			status: 200,
			message: "Authentication successful! You can close this window.",
		};
	} catch (error) {
		console.error("[gog-oauth] Token exchange error:", error);
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

/**
 * Handle HTTP request
 */
async function handleRequest(
	req: http.IncomingMessage,
	res: http.ServerResponse,
	config: Required<OAuthServerConfig>,
	agentDir: string,
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
			error_description:
				url.searchParams.get("error_description") || undefined,
		};

		const result = await handleCallback(params, agentDir);

		res.statusCode = result.status;
		res.setHeader("Content-Type", "text/html");
		res.end(`
<!DOCTYPE html>
<html>
<head>
	<title>Google OAuth - OpenClaw</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			display: flex;
			align-items: center;
			justify-content: center;
			height: 100vh;
			margin: 0;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		}
		.container {
			background: white;
			padding: 2rem;
			border-radius: 8px;
			box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
			text-align: center;
			max-width: 400px;
		}
		h1 {
			color: ${result.status === 200 ? "#10b981" : "#ef4444"};
			margin-top: 0;
		}
		p {
			color: #6b7280;
			line-height: 1.5;
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>${result.status === 200 ? "✓ Success" : "✗ Error"}</h1>
		<p>${result.message}</p>
	</div>
</body>
</html>
		`);
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
	config: Required<OAuthServerConfig>,
	agentDir: string,
): Promise<http.Server> {
	return new Promise((resolve, reject) => {
		const srv = http.createServer((req, res) => {
			handleRequest(req, res, config, agentDir).catch((err) => {
				console.error("[gog-oauth] Request handler error:", err);
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
 * Start the OAuth callback server with port fallback
 */
export async function startGogOAuthServer(
	config: Partial<OAuthServerConfig>,
	agentDir: string,
): Promise<{
	port: number;
	stop: () => Promise<void>;
}> {
	const fullConfig: Required<OAuthServerConfig> = {
		...DEFAULT_CONFIG,
		...config,
	};

	if (!fullConfig.enabled) {
		throw new Error("OAuth server is disabled in configuration");
	}

	// Try ports from 51234 to 51239
	const ports = [fullConfig.port, 51235, 51236, 51237, 51238, 51239];
	let lastError: Error | null = null;

	for (const port of ports) {
		try {
			server = await tryStartServer(port, fullConfig.bind, fullConfig, agentDir);
			actualPort = port;
			console.log(
				`[gog-oauth] Server listening on ${fullConfig.bind}:${port}`,
			);

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
			// Try next port
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
