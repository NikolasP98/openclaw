/**
 * Provisioning Key Management Commands
 *
 * Commands for managing AI provider provisioning keys and agent provisioning keys
 */

import { randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import type { AiProviderKey } from "../gateway/ai-provisioning/types.js";
import type { AgentProvisioningKey, ProvisionScope } from "../gateway/provisioning/types.js";
import {
	loadAiProviderKeys,
	addAiProviderKey,
	removeAiProviderKey,
} from "../gateway/ai-provisioning/storage.js";
import {
	loadAgentProvisioningKeys,
	addAgentProvisioningKey,
	removeAgentProvisioningKey,
	updateAgentProvisioningKey,
} from "../gateway/provisioning/storage.js";

const baseDataDir = resolveUserPath("~/.openclaw");
const aiProviderKeysPath = join(baseDataDir, "provisioning/ai-providers.json");
const agentProvisioningKeysPath = join(baseDataDir, "provisioning/keys.json");

/**
 * Parse duration string (e.g., "30d", "1y") to milliseconds
 */
function parseDuration(duration: string): number {
	const match = duration.match(/^(\d+)([dhmy])$/);
	if (!match) {
		throw new Error(`Invalid duration format: ${duration}. Use format like 30d, 1y, etc.`);
	}

	const value = parseInt(match[1], 10);
	const unit = match[2];

	switch (unit) {
		case "d":
			return value * 24 * 60 * 60 * 1000;
		case "h":
			return value * 60 * 60 * 1000;
		case "m":
			return value * 60 * 1000;
		case "y":
			return value * 365 * 24 * 60 * 60 * 1000;
		default:
			throw new Error(`Unknown duration unit: ${unit}`);
	}
}

/**
 * Generate a secure provisioning key (48-byte hex = 96 characters)
 */
function generateProvisioningKey(): string {
	return randomBytes(48).toString("hex");
}

// ============================================================================
// AI Provider Provisioning Key Commands
// ============================================================================

type AiProvidersAddOptions = {
	provider: "anthropic" | "openai" | "gemini";
	name?: string;
	key: string;
	expires?: string;
	quotasPerAgent?: string;
};

export async function aiProvidersAddCommand(
	opts: AiProvidersAddOptions,
	runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
	try {
		// Parse quotas if provided
		let quotas;
		if (opts.quotasPerAgent) {
			const parts = opts.quotasPerAgent.split(",");
			quotas = {};
			for (const part of parts) {
				const [key, value] = part.split("=");
				if (key === "maxTokensPerMonth") {
					quotas.maxTokensPerMonth = parseInt(value, 10);
				} else if (key === "maxRequestsPerDay") {
					quotas.maxRequestsPerDay = parseInt(value, 10);
				}
			}
		}

		const aiProviderKey: AiProviderKey = {
			id: randomUUID(),
			provider: opts.provider,
			name: opts.name,
			masterKey: opts.key,
			createdAt: Date.now(),
			expiresAt: opts.expires ? Date.now() + parseDuration(opts.expires) : undefined,
			quotas,
		};

		await addAiProviderKey(aiProviderKeysPath, aiProviderKey);

		runtime.log(
			`AI provider key added: ${aiProviderKey.id} (${aiProviderKey.provider})`,
		);
	} catch (error) {
		runtime.error(`Failed to add AI provider key: ${error instanceof Error ? error.message : String(error)}`);
		runtime.exit(1);
	}
}

type AiProvidersListOptions = {
	json?: boolean;
};

export async function aiProvidersListCommand(
	opts: AiProvidersListOptions,
	runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
	try {
		const keys = await loadAiProviderKeys(aiProviderKeysPath);

		if (opts.json) {
			runtime.log(JSON.stringify(keys, null, 2));
			return;
		}

		if (keys.length === 0) {
			runtime.log("No AI provider keys configured.");
			return;
		}

		runtime.log("AI Provider Provisioning Keys:");
		for (const key of keys) {
			runtime.log(`  ${key.id}`);
			runtime.log(`    Provider: ${key.provider}`);
			if (key.name) {
				runtime.log(`    Name: ${key.name}`);
			}
			runtime.log(`    Created: ${new Date(key.createdAt).toISOString()}`);
			if (key.expiresAt) {
				runtime.log(`    Expires: ${new Date(key.expiresAt).toISOString()}`);
			}
			if (key.quotas) {
				runtime.log(`    Quotas: ${JSON.stringify(key.quotas)}`);
			}
		}
	} catch (error) {
		runtime.error(`Failed to list AI provider keys: ${error instanceof Error ? error.message : String(error)}`);
		runtime.exit(1);
	}
}

type AiProvidersRevokeOptions = {
	keyId: string;
};

export async function aiProvidersRevokeCommand(
	opts: AiProvidersRevokeOptions,
	runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
	try {
		const removed = await removeAiProviderKey(aiProviderKeysPath, opts.keyId);
		if (removed) {
			runtime.log(`AI provider key revoked: ${opts.keyId}`);
		} else {
			runtime.error(`AI provider key not found: ${opts.keyId}`);
			runtime.exit(1);
		}
	} catch (error) {
		runtime.error(`Failed to revoke AI provider key: ${error instanceof Error ? error.message : String(error)}`);
		runtime.exit(1);
	}
}

// ============================================================================
// Agent Provisioning Key Commands
// ============================================================================

type AgentKeysCreateOptions = {
	name?: string;
	scopes: string;
	aiProviderKey?: string;
	expires?: string;
	maxUses?: number;
	outputKeyOnly?: boolean;
};

export async function agentKeysCreateCommand(
	opts: AgentKeysCreateOptions,
	runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
	try {
		// Parse scopes
		const scopes = opts.scopes.split(",") as ProvisionScope[];
		const validScopes: ProvisionScope[] = [
			"agents:create",
			"agents:delete",
			"agents:configure",
			"agents:onboard",
		];
		for (const scope of scopes) {
			if (!validScopes.includes(scope)) {
				throw new Error(`Invalid scope: ${scope}. Valid scopes: ${validScopes.join(", ")}`);
			}
		}

		// Generate key
		const key = generateProvisioningKey();

		const agentProvisioningKey: AgentProvisioningKey = {
			id: randomUUID(),
			key,
			name: opts.name,
			scopes,
			createdAt: Date.now(),
			expiresAt: opts.expires ? Date.now() + parseDuration(opts.expires) : undefined,
			maxUses: opts.maxUses,
			usesCount: 0,
			aiProviderKeyId: opts.aiProviderKey,
		};

		await addAgentProvisioningKey(agentProvisioningKeysPath, agentProvisioningKey);

		if (opts.outputKeyOnly) {
			runtime.log(key);
		} else {
			runtime.log("Agent provisioning key created:");
			runtime.log(`  ID: ${agentProvisioningKey.id}`);
			runtime.log(`  Key: ${key}`);
			runtime.log(`  Scopes: ${scopes.join(", ")}`);
			if (opts.aiProviderKey) {
				runtime.log(`  Linked AI Provider Key: ${opts.aiProviderKey}`);
			}
			if (opts.expires) {
				runtime.log(`  Expires: ${new Date(agentProvisioningKey.expiresAt!).toISOString()}`);
			}
			runtime.log("\nSave this key securely - it will not be displayed again.");
		}
	} catch (error) {
		runtime.error(`Failed to create agent provisioning key: ${error instanceof Error ? error.message : String(error)}`);
		runtime.exit(1);
	}
}

type AgentKeysListOptions = {
	json?: boolean;
};

export async function agentKeysListCommand(
	opts: AgentKeysListOptions,
	runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
	try {
		const keys = await loadAgentProvisioningKeys(agentProvisioningKeysPath);

		if (opts.json) {
			// Don't include actual keys in JSON output for security
			const safeKeys = keys.map((k) => ({
				...k,
				key: k.key.slice(0, 8) + "..." + k.key.slice(-8),
			}));
			runtime.log(JSON.stringify(safeKeys, null, 2));
			return;
		}

		if (keys.length === 0) {
			runtime.log("No agent provisioning keys configured.");
			return;
		}

		runtime.log("Agent Provisioning Keys:");
		for (const key of keys) {
			runtime.log(`  ${key.id}`);
			if (key.name) {
				runtime.log(`    Name: ${key.name}`);
			}
			runtime.log(`    Scopes: ${key.scopes.join(", ")}`);
			runtime.log(`    Usage: ${key.usesCount}${key.maxUses ? `/${key.maxUses}` : ""}`);
			if (key.aiProviderKeyId) {
				runtime.log(`    Linked AI Provider: ${key.aiProviderKeyId}`);
			}
			if (key.revokedAt) {
				runtime.log(`    Status: REVOKED (${new Date(key.revokedAt).toISOString()})`);
			} else if (key.expiresAt && Date.now() > key.expiresAt) {
				runtime.log(`    Status: EXPIRED (${new Date(key.expiresAt).toISOString()})`);
			} else {
				runtime.log("    Status: ACTIVE");
			}
		}
	} catch (error) {
		runtime.error(`Failed to list agent provisioning keys: ${error instanceof Error ? error.message : String(error)}`);
		runtime.exit(1);
	}
}

type AgentKeysRevokeOptions = {
	keyId: string;
};

export async function agentKeysRevokeCommand(
	opts: AgentKeysRevokeOptions,
	runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
	try {
		const updated = await updateAgentProvisioningKey(agentProvisioningKeysPath, opts.keyId, {
			revokedAt: Date.now(),
		});

		if (updated) {
			runtime.log(`Agent provisioning key revoked: ${opts.keyId}`);
		} else {
			runtime.error(`Agent provisioning key not found: ${opts.keyId}`);
			runtime.exit(1);
		}
	} catch (error) {
		runtime.error(`Failed to revoke agent provisioning key: ${error instanceof Error ? error.message : String(error)}`);
		runtime.exit(1);
	}
}

type AgentKeysRotateOptions = {
	keyId: string;
};

export async function agentKeysRotateCommand(
	opts: AgentKeysRotateOptions,
	runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
	try {
		const keys = await loadAgentProvisioningKeys(agentProvisioningKeysPath);
		const oldKey = keys.find((k) => k.id === opts.keyId);

		if (!oldKey) {
			runtime.error(`Agent provisioning key not found: ${opts.keyId}`);
			runtime.exit(1);
			return;
		}

		// Generate new key
		const newKeyValue = generateProvisioningKey();

		// Update existing key
		await updateAgentProvisioningKey(agentProvisioningKeysPath, opts.keyId, {
			key: newKeyValue,
			usesCount: 0,
			lastUsedAt: undefined,
		});

		runtime.log("Agent provisioning key rotated:");
		runtime.log(`  ID: ${opts.keyId}`);
		runtime.log(`  New Key: ${newKeyValue}`);
		runtime.log("\nSave this key securely - it will not be displayed again.");
	} catch (error) {
		runtime.error(`Failed to rotate agent provisioning key: ${error instanceof Error ? error.message : String(error)}`);
		runtime.exit(1);
	}
}
