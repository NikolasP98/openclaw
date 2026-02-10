/**
 * gog_auth_revoke tool - Revoke Google OAuth credentials
 */

import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { revokeCredentials } from "../../hooks/gog-credentials.js";
import type { OAuthRevokeResult } from "../../hooks/gog-oauth-types.js";
import { updateSessionStore, resolveDefaultSessionStorePath } from "../../config/sessions.js";

const GogAuthRevokeSchema = Type.Object({
	email: Type.Optional(
		Type.String({
			description:
				"Specific Google account email to revoke (optional, defaults to session credentials)",
		}),
	),
});

export function createGogAuthRevokeTool(opts?: {
	agentId?: string;
	agentDir?: string;
	sessionKey?: string;
}): AnyAgentTool {
	return {
		label: "Google Auth Revoke",
		name: "gog_auth_revoke",
		description:
			"Revoke Google OAuth credentials for this session. This will delete local credentials and revoke access with Google.",
		parameters: GogAuthRevokeSchema,
		execute: async (_toolCallId, args) => {
			const params = args as Record<string, unknown>;
			const email = readStringParam(params, "email");

			if (!opts?.agentId || !opts?.agentDir || !opts?.sessionKey) {
				return jsonResult({
					error: "Missing agent context (agentId, agentDir, or sessionKey)",
				});
			}

			try {
				// Revoke credentials
				await revokeCredentials(opts.agentId, opts.sessionKey, email);

				// Update session entry
				const storePath = resolveDefaultSessionStorePath(opts.agentId);
				await updateSessionStore(storePath, (store) => {
					const session = store[opts.sessionKey!];
					if (session) {
						delete session.gogCredentialsFile;
						delete session.gogAuthEmail;
						delete session.gogAuthPending;
						session.updatedAt = Date.now();
					}
				});

				const result: OAuthRevokeResult = {
					success: true,
				};

				return jsonResult(result);
			} catch (error) {
				const result: OAuthRevokeResult = {
					success: false,
					error:
						error instanceof Error ? error.message : "Unknown error occurred",
				};

				return jsonResult(result);
			}
		},
	};
}
