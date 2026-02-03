/**
 * GET /api/v1/agents/:id - Get agent status
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { stat } from "node:fs/promises";
import type { ResolvedGatewayAuth } from "../auth.js";
import { loadConfig } from "../../config/config.js";
import { listAgentEntries } from "../../commands/agents.config.js";
import { resolveAgentDir, resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { resolveAuthStorePath } from "../../agents/auth-profiles/paths.js";

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: any): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(data));
}

/**
 * Check if a path exists
 */
async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Handle GET /api/v1/agents/:id
 */
export async function handleAgentsStatusRequest(
	_req: IncomingMessage,
	res: ServerResponse,
	opts: {
		auth: ResolvedGatewayAuth;
		agentId: string;
	},
): Promise<boolean> {
	try {
		const cfg = await loadConfig();
		const agents = listAgentEntries(cfg);
		const agent = agents.find((a) => a.id === opts.agentId);

		if (!agent) {
			sendJson(res, 404, { error: `Agent not found: ${opts.agentId}` });
			return true;
		}

		// Resolve paths
		const workspace = agent.workspace ?? resolveAgentWorkspaceDir(cfg, agent.id);
		const agentDir = agent.agentDir ?? resolveAgentDir(cfg, agent.id);
		const authStorePath = resolveAuthStorePath(agentDir);

		// Check existence
		const workspaceExists = await pathExists(workspace);
		const agentDirExists = await pathExists(agentDir);
		const authConfigured = await pathExists(authStorePath);

		// Get configured channels (from routing bindings)
		const channelsConfigured: string[] = [];
		if (cfg.routing?.bindings) {
			for (const binding of cfg.routing.bindings) {
				if (binding.agentId === agent.id && binding.channel) {
					if (!channelsConfigured.includes(binding.channel)) {
						channelsConfigured.push(binding.channel);
					}
				}
			}
		}

		const response = {
			agentId: agent.id,
			name: agent.name ?? agent.id,
			workspace,
			agentDir,
			model: agent.model,
			health: {
				workspaceExists,
				agentDirExists,
				authConfigured,
				channelsConfigured,
			},
		};

		sendJson(res, 200, response);
		return true;
	} catch (error) {
		sendJson(res, 500, {
			error: `Failed to get agent status: ${error instanceof Error ? error.message : String(error)}`,
		});
		return true;
	}
}
