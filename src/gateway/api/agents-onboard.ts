/**
 * POST /api/v1/agents/:id/onboard - Onboard agent
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ResolvedGatewayAuth } from "../auth.js";
import { validateProvisioningRequest } from "./middleware.js";
import { loadConfig } from "../../config/config.js";
import { auditLog, auditSuccess, auditError } from "../provisioning/audit.js";
import { resolveUserPath } from "../../utils.js";
import { join } from "node:path";
import { listAgentEntries } from "../../commands/agents.config.js";
import { resolveAgentDir } from "../../agents/agent-scope.js";
import { ensureAuthProfileStore } from "../../agents/auth-profiles.js";

/**
 * Parse JSON body from request
 */
async function parseJsonBody(req: IncomingMessage): Promise<any> {
	return new Promise((resolve, reject) => {
		let body = "";
		req.on("data", (chunk) => {
			body += chunk.toString();
			if (body.length > 1024 * 1024) {
				// 1MB limit
				reject(new Error("Request body too large"));
			}
		});
		req.on("end", () => {
			try {
				resolve(JSON.parse(body));
			} catch (error) {
				reject(new Error("Invalid JSON"));
			}
		});
		req.on("error", reject);
	});
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: any): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(data));
}

/**
 * Handle POST /api/v1/agents/:id/onboard
 */
export async function handleAgentsOnboardRequest(
	req: IncomingMessage,
	res: ServerResponse,
	opts: {
		auth: ResolvedGatewayAuth;
		trustedProxies?: string[];
		rateLimitPerMinute?: number;
		baseDataDir?: string;
		agentId: string;
	},
): Promise<boolean> {
	// Validate provisioning request
	const validation = await validateProvisioningRequest(req, "agents:onboard", opts);
	if (!validation.ok) {
		sendJson(res, validation.status, { error: validation.error });
		return true;
	}

	const { context } = validation;
	const baseDataDir = opts.baseDataDir ?? resolveUserPath("~/.openclaw");
	const auditLogPath = join(baseDataDir, "provisioning/audit.jsonl");

	try {
		// Parse request body
		let body: {
			steps: string[];
			auth?: {
				provider: string;
				credentials?: {
					apiKey?: string;
					sessionKey?: string;
				};
				model?: string;
			};
		};
		try {
			body = await parseJsonBody(req);
		} catch (error) {
			await auditLog(
				auditLogPath,
				auditError(
					context.agentProvisioningKey.id,
					"agents:onboard",
					`Invalid request body: ${error instanceof Error ? error.message : String(error)}`,
					context.remoteIp,
					opts.agentId,
				),
			);
			sendJson(res, 400, {
				error: `Invalid request body: ${error instanceof Error ? error.message : String(error)}`,
			});
			return true;
		}

		// Check if agent exists
		const cfg = await loadConfig();
		const agents = listAgentEntries(cfg);
		const agent = agents.find((a) => a.id === opts.agentId);

		if (!agent) {
			await auditLog(
				auditLogPath,
				auditError(
					context.agentProvisioningKey.id,
					"agents:onboard",
					`Agent not found: ${opts.agentId}`,
					context.remoteIp,
					opts.agentId,
				),
			);
			sendJson(res, 404, { error: `Agent not found: ${opts.agentId}` });
			return true;
		}

		const completed: string[] = [];
		const failed: string[] = [];
		const errors: Record<string, string> = {};

		// Resolve agent directory
		const agentDir = agent.agentDir ?? resolveAgentDir(cfg, agent.id);

		// Process steps
		for (const step of body.steps) {
			try {
				if (step === "auth" && body.auth) {
					// Configure authentication
					const authStore = ensureAuthProfileStore(agentDir, {
						allowKeychainPrompt: false,
					});

					const profileId = `${body.auth.provider}:${opts.agentId}:onboard`;

					// Add auth profile
					if (body.auth.credentials?.apiKey) {
						authStore.addProfile({
							id: profileId,
							provider: body.auth.provider,
							apiKey: body.auth.credentials.apiKey,
						});
					} else if (body.auth.credentials?.sessionKey) {
						authStore.addProfile({
							id: profileId,
							provider: body.auth.provider,
							sessionKey: body.auth.credentials.sessionKey,
						});
					} else {
						throw new Error("Missing credentials (apiKey or sessionKey required)");
					}

					await authStore.save();
					completed.push("auth");
				} else if (step === "channels") {
					// Channel configuration would go here
					// For now, just mark as completed
					completed.push("channels");
				} else if (step === "bindings") {
					// Bindings configuration would go here
					// For now, just mark as completed
					completed.push("bindings");
				} else {
					throw new Error(`Unknown step: ${step}`);
				}
			} catch (error) {
				failed.push(step);
				errors[step] = error instanceof Error ? error.message : String(error);
			}
		}

		// Audit log success
		await auditLog(
			auditLogPath,
			auditSuccess(
				context.agentProvisioningKey.id,
				"agents:onboard",
				context.remoteIp,
				opts.agentId,
			),
		);

		// Return success
		sendJson(res, 200, {
			agentId: opts.agentId,
			completed,
			failed,
			errors,
		});
		return true;
	} catch (error) {
		// Audit log error
		await auditLog(
			auditLogPath,
			auditError(
				context.agentProvisioningKey.id,
				"agents:onboard",
				error instanceof Error ? error.message : String(error),
				context.remoteIp,
				opts.agentId,
			),
		);

		// Return error
		sendJson(res, 500, {
			error: error instanceof Error ? error.message : String(error),
		});
		return true;
	}
}
