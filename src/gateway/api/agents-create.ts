/**
 * POST /api/v1/agents/create - Create a new agent
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { ResolvedGatewayAuth } from "../auth.js";
import { validateProvisioningRequest } from "./middleware.js";
import { createAgent, type CreateAgentParams } from "../../commands/agents/create-service.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { auditLog, auditSuccess, auditError } from "../provisioning/audit.js";
import { incrementKeyUsage } from "../provisioning/storage.js";
import { resolveUserPath } from "../../utils.js";
import { join } from "node:path";

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
 * Handle POST /api/v1/agents/create
 */
export async function handleAgentsCreateRequest(
	req: IncomingMessage,
	res: ServerResponse,
	opts: {
		auth: ResolvedGatewayAuth;
		trustedProxies?: string[];
		rateLimitPerMinute?: number;
		baseDataDir?: string;
	},
): Promise<boolean> {
	// Validate provisioning request
	const validation = await validateProvisioningRequest(req, "agents:create", opts);
	if (!validation.ok) {
		sendJson(res, validation.status, { error: validation.error });
		return true;
	}

	const { context } = validation;
	const baseDataDir = opts.baseDataDir ?? resolveUserPath("~/.openclaw");
	const auditLogPath = join(baseDataDir, "provisioning/audit.jsonl");
	const provisioningKeysPath = join(baseDataDir, "provisioning/keys.json");
	const aiKeyMappingsPath = join(baseDataDir, "provisioning/ai-key-mappings.json");

	try {
		// Parse request body
		let body: CreateAgentParams;
		try {
			body = await parseJsonBody(req);
		} catch (error) {
			await auditLog(
				auditLogPath,
				auditError(
					context.agentProvisioningKey.id,
					"agents:create",
					`Invalid request body: ${error instanceof Error ? error.message : String(error)}`,
					context.remoteIp,
				),
			);
			sendJson(res, 400, {
				error: `Invalid request body: ${error instanceof Error ? error.message : String(error)}`,
			});
			return true;
		}

		// Validate required fields
		if (!body.name || typeof body.name !== "string") {
			await auditLog(
				auditLogPath,
				auditError(
					context.agentProvisioningKey.id,
					"agents:create",
					"Missing or invalid 'name' field",
					context.remoteIp,
				),
			);
			sendJson(res, 400, { error: "Missing or invalid 'name' field" });
			return true;
		}

		if (!body.workspace || typeof body.workspace !== "string") {
			await auditLog(
				auditLogPath,
				auditError(
					context.agentProvisioningKey.id,
					"agents:create",
					"Missing or invalid 'workspace' field",
					context.remoteIp,
				),
			);
			sendJson(res, 400, { error: "Missing or invalid 'workspace' field" });
			return true;
		}

		// Check if auto-provisioning is requested but no AI provider key is linked
		if (body.autoProvisionAiKey && !context.aiProviderKey) {
			await auditLog(
				auditLogPath,
				auditError(
					context.agentProvisioningKey.id,
					"agents:create",
					"Auto-provisioning requested but no AI provider key linked",
					context.remoteIp,
				),
			);
			sendJson(res, 403, {
				error:
					"Auto-provisioning requested but no AI provider key linked to this provisioning key",
			});
			return true;
		}

		// Load config
		const cfg = await loadConfig();

		// Create agent
		const result = await createAgent(body, cfg, {
			aiProviderKey: context.aiProviderKey,
			aiKeyMappingsPath,
		});

		// Write updated config
		await writeConfigFile(result.config ?? cfg);

		// Increment key usage
		await incrementKeyUsage(provisioningKeysPath, context.agentProvisioningKey.id);

		// Audit log success
		await auditLog(
			auditLogPath,
			auditSuccess(
				context.agentProvisioningKey.id,
				"agents:create",
				context.remoteIp,
				result.agentId,
			),
		);

		// Return success
		sendJson(res, 202, result);
		return true;
	} catch (error) {
		// Audit log error
		await auditLog(
			auditLogPath,
			auditError(
				context.agentProvisioningKey.id,
				"agents:create",
				error instanceof Error ? error.message : String(error),
				context.remoteIp,
			),
		);

		// Return error
		sendJson(res, 400, {
			error: error instanceof Error ? error.message : String(error),
		});
		return true;
	}
}
