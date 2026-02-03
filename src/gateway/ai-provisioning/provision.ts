/**
 * AI Key Provisioning Service
 *
 * Provisions new AI API keys for agents using master provider keys
 */

import { randomUUID } from "node:crypto";
import type { AiProviderKey, ProvisionedKeyMapping } from "./types.js";
import { provisionAnthropicKey } from "./providers/anthropic.js";
import { provisionOpenAiKey } from "./providers/openai.js";
import { provisionGeminiKey } from "./providers/gemini.js";
import { addProvisionedKeyMapping } from "./storage.js";

/**
 * Result of provisioning an AI key for an agent
 */
export type ProvisionAiKeyResult = {
	/** OpenClaw auth profile ID */
	profileId: string;
	/** Provider's key ID (for tracking/revocation) */
	keyId: string;
	/** The actual API key (sensitive - handle carefully) */
	apiKey: string;
};

/**
 * Provision a new AI API key for an agent
 *
 * This function:
 * 1. Calls the provider-specific provisioning function
 * 2. Creates an auth profile ID for the agent
 * 3. Stores the mapping between agent and key
 * 4. Returns the profile ID and key
 *
 * @param agentId - Agent ID to provision key for
 * @param providerKey - Master AI provider key to use
 * @param quotas - Optional quotas to apply to the new key
 * @param mappingsFilePath - Path to provisioned key mappings file
 * @returns Profile ID, key ID, and API key
 */
export async function provisionAiKeyForAgent(
	agentId: string,
	providerKey: AiProviderKey,
	options: {
		quotas?: {
			maxTokensPerMonth?: number;
			maxRequestsPerDay?: number;
		};
		mappingsFilePath: string;
	},
): Promise<ProvisionAiKeyResult> {
	// Create descriptive name for the new key
	const keyName = `openclaw-agent-${agentId}`;

	// Merge quotas from provider key and request
	const mergedQuotas = {
		...providerKey.quotas,
		...options.quotas,
	};

	// Call provider-specific provisioning function
	let provisionResult;
	try {
		switch (providerKey.provider) {
			case "anthropic":
				provisionResult = await provisionAnthropicKey(providerKey.masterKey, {
					name: keyName,
					quotas: mergedQuotas,
				});
				break;
			case "openai":
				provisionResult = await provisionOpenAiKey(providerKey.masterKey, {
					name: keyName,
					quotas: mergedQuotas,
				});
				break;
			case "gemini":
				provisionResult = await provisionGeminiKey(providerKey.masterKey, {
					name: keyName,
					quotas: mergedQuotas,
				});
				break;
			default:
				throw new Error(`Unsupported AI provider: ${providerKey.provider}`);
		}
	} catch (error) {
		throw new Error(
			`Failed to provision ${providerKey.provider} key for agent ${agentId}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// Create auth profile ID
	const profileId = `${providerKey.provider}:${agentId}:${randomUUID().slice(0, 8)}`;

	// Store mapping
	const mapping: ProvisionedKeyMapping = {
		agentId,
		provider: providerKey.provider,
		keyId: provisionResult.keyId,
		profileId,
		provisionedAt: Date.now(),
		quotas: Object.keys(mergedQuotas).length > 0 ? mergedQuotas : undefined,
	};

	await addProvisionedKeyMapping(options.mappingsFilePath, mapping);

	return {
		profileId,
		keyId: provisionResult.keyId,
		apiKey: provisionResult.key,
	};
}
