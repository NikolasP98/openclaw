/**
 * Middleware for Provisioning API
 */

import type { IncomingMessage } from "node:http";
import type { ResolvedGatewayAuth } from "../auth.js";
import type { AgentProvisioningKey } from "../provisioning/types.js";
import type { AiProviderKey } from "../ai-provisioning/types.js";
import type { ProvisionScope } from "../provisioning/types.js";
import { getAgentProvisioningKeyByKey } from "../provisioning/storage.js";
import { getAiProviderKeyById } from "../ai-provisioning/storage.js";
import { validateProvisioningKey } from "../provisioning/validation.js";
import { ProvisioningRateLimiter } from "../provisioning/rate-limit.js";
import { resolveUserPath } from "../../utils.js";
import { join } from "node:path";

/**
 * Context for a validated provisioning request
 */
export type ProvisioningContext = {
	gatewayAuth: ResolvedGatewayAuth;
	agentProvisioningKey: AgentProvisioningKey;
	aiProviderKey?: AiProviderKey;
	remoteIp: string;
};

/**
 * Global rate limiter instance
 */
let rateLimiter: ProvisioningRateLimiter | undefined;

/**
 * Get or create the rate limiter
 */
function getRateLimiter(maxRequestsPerMinute: number): ProvisioningRateLimiter {
	if (!rateLimiter) {
		rateLimiter = new ProvisioningRateLimiter(maxRequestsPerMinute);
	}
	return rateLimiter;
}

/**
 * Extract remote IP from request, considering trusted proxies
 */
function extractRemoteIp(req: IncomingMessage, trustedProxies?: string[]): string {
	const directIp = req.socket.remoteAddress ?? "unknown";

	// Check if request is from a trusted proxy
	if (trustedProxies && trustedProxies.includes(directIp)) {
		// Trust X-Forwarded-For or X-Real-IP headers
		const forwardedFor = req.headers["x-forwarded-for"];
		if (forwardedFor) {
			const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
			return ips.split(",")[0].trim();
		}

		const realIp = req.headers["x-real-ip"];
		if (realIp) {
			return Array.isArray(realIp) ? realIp[0] : realIp;
		}
	}

	return directIp;
}

/**
 * Validate a provisioning request
 *
 * Checks:
 * 1. Gateway authentication (existing auth system)
 * 2. Agent provisioning key (from X-Agent-Provisioning-Key header)
 * 3. Scope authorization
 * 4. Rate limiting
 * 5. Load linked AI provider key if configured
 */
export async function validateProvisioningRequest(
	req: IncomingMessage,
	requiredScope: ProvisionScope,
	options: {
		auth: ResolvedGatewayAuth;
		rateLimitPerMinute?: number;
		trustedProxies?: string[];
		baseDataDir?: string;
	},
): Promise<
	| { ok: true; context: ProvisioningContext }
	| { ok: false; status: number; error: string }
> {
	// Extract remote IP for rate limiting and audit logging
	const remoteIp = extractRemoteIp(req, options.trustedProxies);

	// Gateway auth is already validated by the caller (existing auth system)
	// Extract agent provisioning key from header
	const provisioningKeyHeader = req.headers["x-agent-provisioning-key"];
	if (!provisioningKeyHeader) {
		return {
			ok: false,
			status: 401,
			error: "Missing X-Agent-Provisioning-Key header",
		};
	}

	const providedKey = Array.isArray(provisioningKeyHeader)
		? provisioningKeyHeader[0]
		: provisioningKeyHeader;

	// Load provisioning key from storage
	const baseDataDir = options.baseDataDir ?? resolveUserPath("~/.openclaw");
	const provisioningKeysPath = join(baseDataDir, "provisioning/keys.json");

	let agentProvisioningKey: AgentProvisioningKey | undefined;
	try {
		agentProvisioningKey = await getAgentProvisioningKeyByKey(provisioningKeysPath, providedKey);
	} catch (error) {
		return {
			ok: false,
			status: 500,
			error: `Failed to load provisioning keys: ${error instanceof Error ? error.message : String(error)}`,
		};
	}

	if (!agentProvisioningKey) {
		return {
			ok: false,
			status: 401,
			error: "Invalid agent provisioning key",
		};
	}

	// Validate key (expiration, revocation, scope)
	const validation = validateProvisioningKey(
		agentProvisioningKey,
		providedKey,
		requiredScope,
	);
	if (!validation.valid) {
		return {
			ok: false,
			status: 403,
			error: validation.reason,
		};
	}

	// Check rate limit
	const rateLimitPerMinute = options.rateLimitPerMinute ?? 10;
	const limiter = getRateLimiter(rateLimitPerMinute);
	if (!limiter.check(agentProvisioningKey.id)) {
		return {
			ok: false,
			status: 429,
			error: "Rate limit exceeded. Try again later.",
		};
	}

	// Load linked AI provider key if configured
	let aiProviderKey: AiProviderKey | undefined;
	if (agentProvisioningKey.aiProviderKeyId) {
		const aiProviderKeysPath = join(baseDataDir, "provisioning/ai-providers.json");
		try {
			aiProviderKey = await getAiProviderKeyById(
				aiProviderKeysPath,
				agentProvisioningKey.aiProviderKeyId,
			);
			if (!aiProviderKey) {
				return {
					ok: false,
					status: 500,
					error: `Linked AI provider key not found: ${agentProvisioningKey.aiProviderKeyId}`,
				};
			}
		} catch (error) {
			return {
				ok: false,
				status: 500,
				error: `Failed to load AI provider key: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	return {
		ok: true,
		context: {
			gatewayAuth: options.auth,
			agentProvisioningKey,
			aiProviderKey,
			remoteIp,
		},
	};
}
