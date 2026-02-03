/**
 * Agents Provisioning API Router
 *
 * Routes HTTP requests for agent management operations:
 * - POST /api/v1/agents/create - Create new agent
 * - GET /api/v1/agents - List agents
 * - GET /api/v1/agents/:id - Get agent status
 * - DELETE /api/v1/agents/:id - Delete agent
 * - POST /api/v1/agents/:id/onboard - Onboard agent (auth/channels/bindings)
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ResolvedGatewayAuth } from "../auth.js";
import { loadConfig } from "../../config/config.js";
import { handleAgentsCreateRequest } from "./agents-create.js";

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: any): void {
	res.statusCode = status;
	res.setHeader("Content-Type", "application/json");
	res.end(JSON.stringify(data));
}

/**
 * Route agents API requests
 *
 * Returns true if the request was handled, false if it should be passed to the next handler.
 */
export async function handleAgentsApiRequest(
	req: IncomingMessage,
	res: ServerResponse,
	opts: {
		auth: ResolvedGatewayAuth;
		trustedProxies?: string[];
		baseDataDir?: string;
	},
): Promise<boolean> {
	const url = new URL(req.url ?? "/", "http://localhost");

	// Only handle /api/v1/agents/* paths
	if (!url.pathname.startsWith("/api/v1/agents")) {
		return false;
	}

	// Check if provisioning is enabled
	const cfg = await loadConfig();
	if (!cfg.gateway?.provisioning?.enabled) {
		sendJson(res, 503, {
			error: "Provisioning API is disabled. Enable it in gateway.provisioning.enabled",
		});
		return true;
	}

	// Extract rate limit from config
	const rateLimitPerMinute = cfg.gateway.provisioning.rateLimitPerMinute ?? 10;

	// Route to handlers
	if (req.method === "POST" && url.pathname === "/api/v1/agents/create") {
		return handleAgentsCreateRequest(req, res, {
			...opts,
			rateLimitPerMinute,
		});
	}

	// TODO: Add more handlers (list, status, delete, onboard)
	// if (req.method === "GET" && url.pathname === "/api/v1/agents") {
	//   return handleAgentsListRequest(req, res, opts);
	// }
	//
	// const agentIdMatch = url.pathname.match(/^\/api\/v1\/agents\/([^/]+)$/);
	// if (agentIdMatch) {
	//   const agentId = agentIdMatch[1];
	//   if (req.method === "GET") {
	//     return handleAgentsStatusRequest(req, res, { ...opts, agentId });
	//   }
	//   if (req.method === "DELETE") {
	//     return handleAgentsDeleteRequest(req, res, { ...opts, agentId });
	//   }
	// }
	//
	// const onboardMatch = url.pathname.match(/^\/api\/v1\/agents\/([^/]+)\/onboard$/);
	// if (onboardMatch && req.method === "POST") {
	//   const agentId = onboardMatch[1];
	//   return handleAgentsOnboardRequest(req, res, { ...opts, agentId });
	// }

	sendJson(res, 404, { error: "Not found" });
	return true;
}
