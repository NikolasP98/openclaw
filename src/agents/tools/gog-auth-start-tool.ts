/**
 * gog_auth_start tool - Start non-blocking Google OAuth flow
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import {
	generateState,
	addPendingFlow,
	getServerPort,
} from "../../hooks/gog-oauth-server.js";
import type {
	PendingOAuthFlow,
	OAuthStartResult,
} from "../../hooks/gog-oauth-types.js";
import { getScopesForServices } from "../../hooks/gog-oauth-types.js";
import { updateSessionStore, resolveDefaultSessionStorePath } from "../../config/sessions.js";

const GogAuthStartSchema = Type.Object({
	email: Type.String({
		description: "Google account email address",
		minLength: 1,
	}),
	services: Type.Optional(
		Type.Array(
			Type.Union([
				Type.Literal("gmail"),
				Type.Literal("calendar"),
				Type.Literal("drive"),
				Type.Literal("contacts"),
				Type.Literal("docs"),
				Type.Literal("sheets"),
			]),
			{
				description:
					"Google services to authorize (default: gmail, calendar, drive)",
			},
		),
	),
});

export function createGogAuthStartTool(opts?: {
	agentId?: string;
	agentDir?: string;
	sessionKey?: string;
}): AnyAgentTool {
	return {
		label: "Google Auth Start",
		name: "gog_auth_start",
		description:
			"Start non-blocking Google OAuth flow for Gmail, Calendar, Drive, and other Google services. Returns an authorization URL for the user to visit. The agent remains responsive while waiting for authorization.",
		parameters: GogAuthStartSchema,
		execute: async (_toolCallId, args) => {
			const params = args as Record<string, unknown>;
			const email = readStringParam(params, "email", { required: true });
			const services = (params.services as string[] | undefined) || [
				"gmail",
				"calendar",
				"drive",
			];

			// Validate email format
			if (!email.includes("@")) {
				return jsonResult({
					error: "Invalid email address format",
				});
			}

			// Check if OAuth server is running
			const serverPort = getServerPort();
			if (!serverPort) {
				return jsonResult({
					error:
						"OAuth server is not running. Please contact the administrator.",
				});
			}

			if (!opts?.agentId || !opts?.agentDir || !opts?.sessionKey) {
				return jsonResult({
					error: "Missing agent context (agentId, agentDir, or sessionKey)",
				});
			}

			// Generate cryptographic state token
			const state = generateState();

			// Calculate expiry (5 minutes)
			const now = Date.now();
			const expiresAt = now + 5 * 60 * 1000;

			// Get OAuth scopes for requested services
			const scopes = getScopesForServices(services);

			// Build OAuth authorization URL
			const clientId = process.env.GOOGLE_CLIENT_ID;
			if (!clientId) {
				return jsonResult({
					error:
						"GOOGLE_CLIENT_ID not configured. Please set up Google OAuth credentials.",
				});
			}

			const redirectUri = `http://localhost:${serverPort}/oauth-callback`;
			const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
			authUrl.searchParams.set("client_id", clientId);
			authUrl.searchParams.set("redirect_uri", redirectUri);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", scopes.join(" "));
			authUrl.searchParams.set("state", state);
			authUrl.searchParams.set("access_type", "offline");
			authUrl.searchParams.set("prompt", "consent");
			authUrl.searchParams.set("login_hint", email);

			// Create pending flow
			const flow: PendingOAuthFlow = {
				state,
				sessionKey: opts.sessionKey,
				agentId: opts.agentId,
				email,
				services,
				requestedAt: now,
				expiresAt,
				authUrl: authUrl.toString(),
			};

			// Store pending flow
			addPendingFlow(flow);

			// Update session entry with pending auth
			const storePath = resolveDefaultSessionStorePath(opts.agentId);
			await updateSessionStore(storePath, (store) => {
				const session = store[opts.sessionKey!];
				if (session) {
					session.gogAuthPending = {
						state,
						requestedAt: now,
						expiresAt,
						email,
						services,
					};
					session.updatedAt = Date.now();
				}
			});

			// Return result
			const result: OAuthStartResult = {
				authUrl: authUrl.toString(),
				state,
				expiresIn: 300, // 5 minutes in seconds
				instructions: `Please visit the link above to authorize access to your Google account. I'll notify you when authentication is complete (or if it times out after 5 minutes).`,
			};

			return jsonResult(result);
		},
	};
}
