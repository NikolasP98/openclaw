/**
 * GET /api/v1/agents - List agents
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ResolvedGatewayAuth } from "../auth.js";
import { loadConfig } from "../../config/config.js";
import { listAgentEntries } from "../../commands/agents.config.js";
import { resolveDefaultAgentId } from "../../agents/agent-scope.js";

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: any): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(data));
}

/**
 * Handle GET /api/v1/agents
 */
export async function handleAgentsListRequest(
	_req: IncomingMessage,
	res: ServerResponse,
	_opts: {
		auth: ResolvedGatewayAuth;
	},
): Promise<boolean> {
	try {
		const cfg = await loadConfig();
		const agents = listAgentEntries(cfg);
		const defaultAgentId = resolveDefaultAgentId(cfg);

		const response = {
			agents: agents.map((agent) => ({
				agentId: agent.id,
				name: agent.name ?? agent.id,
				default: agent.id === defaultAgentId,
			})),
			defaultAgentId,
		};

		sendJson(res, 200, response);
		return true;
	} catch (error) {
		sendJson(res, 500, {
			error: `Failed to list agents: ${error instanceof Error ? error.message : String(error)}`,
		});
		return true;
	}
}
