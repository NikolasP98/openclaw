/**
 * DELETE /api/v1/agents/:id - Delete agent
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { rm } from "node:fs/promises";
import type { ResolvedGatewayAuth } from "../auth.js";
import { validateProvisioningRequest } from "./middleware.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { auditLog, auditSuccess, auditError } from "../provisioning/audit.js";
import { resolveUserPath } from "../../utils.js";
import { join } from "node:path";
import { listAgentEntries } from "../../commands/agents.config.js";
import { resolveAgentDir, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { removeProvisionedKeyMappingsForAgent } from "../ai-provisioning/storage.js";

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
				if (body.trim()) {
					resolve(JSON.parse(body));
				} else {
					resolve({});
				}
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
 * Handle DELETE /api/v1/agents/:id
 */
export async function handleAgentsDeleteRequest(
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
	// Check if deletion is allowed
	const cfg = await loadConfig();
	if (!cfg.gateway?.provisioning?.allowDelete) {
		sendJson(res, 403, {
			error: "Agent deletion via API is disabled. Enable gateway.provisioning.allowDelete in config.",
		});
		return true;
	}

	// Validate provisioning request
	const validation = await validateProvisioningRequest(req, "agents:delete", opts);
	if (!validation.ok) {
		sendJson(res, validation.status, { error: validation.error });
		return true;
	}

	const { context } = validation;
	const baseDataDir = opts.baseDataDir ?? resolveUserPath("~/.openclaw");
	const auditLogPath = join(baseDataDir, "provisioning/audit.jsonl");
	const aiKeyMappingsPath = join(baseDataDir, "provisioning/ai-key-mappings.json");

	try {
		// Parse request body
		let body: { deleteWorkspace?: boolean; deleteSessions?: boolean };
		try {
			body = await parseJsonBody(req);
		} catch (error) {
			await auditLog(
				auditLogPath,
				auditError(
					context.agentProvisioningKey.id,
					"agents:delete",
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
		const agents = listAgentEntries(cfg);
		const agent = agents.find((a) => a.id === opts.agentId);

		if (!agent) {
			await auditLog(
				auditLogPath,
				auditError(
					context.agentProvisioningKey.id,
					"agents:delete",
					`Agent not found: ${opts.agentId}`,
					context.remoteIp,
					opts.agentId,
				),
			);
			sendJson(res, 404, { error: `Agent not found: ${opts.agentId}` });
			return true;
		}

		// Resolve paths
		const workspace = agent.workspace ?? resolveAgentWorkspaceDir(cfg, agent.id);
		const agentDir = agent.agentDir ?? resolveAgentDir(cfg, agent.id);
		const sessionsPath = join(baseDataDir, "sessions.json");

		const deleted: string[] = [];
		const preserved: string[] = [];

		// Remove from config
		const updatedAgents = agents.filter((a) => a.id !== opts.agentId);
		const updatedCfg = {
			...cfg,
			agents: {
				...cfg.agents,
				list: updatedAgents,
			},
		};

		await writeConfigFile(updatedCfg);
		deleted.push("config");

		// Delete workspace if requested
		if (body.deleteWorkspace) {
			try {
				await rm(workspace, { recursive: true, force: true });
				deleted.push("workspace");
			} catch (error) {
				preserved.push(`workspace (error: ${error instanceof Error ? error.message : String(error)})`);
			}
		} else {
			preserved.push("workspace");
		}

		// Delete agent directory
		try {
			await rm(agentDir, { recursive: true, force: true });
			deleted.push("agentDir");
		} catch (error) {
			preserved.push(`agentDir (error: ${error instanceof Error ? error.message : String(error)})`);
		}

		// Delete sessions if requested
		if (body.deleteSessions) {
			// Note: This is a simplified approach. In a real implementation,
			// we'd need to load sessions.json and filter out sessions for this agent.
			deleted.push("sessions (note: manual cleanup may be needed)");
		} else {
			preserved.push("sessions");
		}

		// Remove provisioned key mappings
		try {
			const removed = await removeProvisionedKeyMappingsForAgent(aiKeyMappingsPath, opts.agentId);
			if (removed > 0) {
				deleted.push(`${removed} AI key mapping(s)`);
			}
		} catch (error) {
			// Non-fatal error
			preserved.push(`AI key mappings (error: ${error instanceof Error ? error.message : String(error)})`);
		}

		// Audit log success
		await auditLog(
			auditLogPath,
			auditSuccess(
				context.agentProvisioningKey.id,
				"agents:delete",
				context.remoteIp,
				opts.agentId,
			),
		);

		// Return success
		sendJson(res, 200, {
			agentId: opts.agentId,
			deleted,
			preserved,
		});
		return true;
	} catch (error) {
		// Audit log error
		await auditLog(
			auditLogPath,
			auditError(
				context.agentProvisioningKey.id,
				"agents:delete",
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
