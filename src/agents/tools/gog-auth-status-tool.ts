/**
 * gog_auth_status tool - Check Google OAuth authentication status
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import { getValidCredentials } from "../../hooks/gog-credentials.js";
import type { OAuthStatusResult } from "../../hooks/gog-oauth-types.js";
import { loadSessionStore } from "../../config/sessions.js";

const GogAuthStatusSchema = Type.Object({});

export function createGogAuthStatusTool(opts?: {
	agentId?: string;
	sessionKey?: string;
}): AnyAgentTool {
	return {
		label: "Google Auth Status",
		name: "gog_auth_status",
		description:
			"Check if the current session has valid Google OAuth credentials. Returns authentication status, email, authorized services, and token expiry.",
		parameters: GogAuthStatusSchema,
		execute: async (_toolCallId, _args) => {
			if (!opts?.agentId || !opts?.sessionKey) {
				return jsonResult({
					error: "Missing agent context (agentId or sessionKey)",
				});
			}

			// Check for pending auth flow
			const sessionStore = await loadSessionStore(opts.agentId);
			const session = sessionStore[opts.sessionKey];
			const hasPendingAuth = !!session?.gogAuthPending;

			// Try to load valid credentials
			const credentials = await getValidCredentials(
				opts.agentId,
				opts.sessionKey,
			);

			if (!credentials) {
				const result: OAuthStatusResult = {
					authenticated: false,
					pending: hasPendingAuth,
				};
				return jsonResult(result);
			}

			// Return status with credentials info
			const result: OAuthStatusResult = {
				authenticated: true,
				email: credentials.email,
				services: credentials.services,
				expiresAt: credentials.expiresAt,
				pending: false,
			};

			return jsonResult(result);
		},
	};
}
