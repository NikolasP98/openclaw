/**
 * AI Provider Provisioning System
 *
 * Manages master API keys for AI providers (Anthropic, OpenAI, Gemini)
 * and uses them to programmatically create new API keys for individual agents.
 */

export type AiProvider = "anthropic" | "openai" | "gemini";

/**
 * Master API key for an AI provider that can be used to provision new API keys
 */
export type AiProviderKey = {
	/** UUID */
	id: string;
	/** AI provider type */
	provider: AiProvider;
	/** Human-readable label */
	name?: string;
	/** Master API key for provisioning sub-keys */
	masterKey: string;
	/** Creation timestamp */
	createdAt: number;
	/** Optional expiration timestamp */
	expiresAt?: number;
	/** Permissions the master key has */
	permissions?: string[];
	/** Optional per-agent quotas to apply when creating keys */
	quotas?: {
		maxTokensPerMonth?: number;
		maxRequestsPerDay?: number;
	};
};

/**
 * Mapping of agent to provisioned AI API key
 */
export type ProvisionedKeyMapping = {
	/** Agent ID this key belongs to */
	agentId: string;
	/** AI provider */
	provider: string;
	/** Provider's key ID (for tracking/revocation) */
	keyId: string;
	/** OpenClaw auth profile ID */
	profileId: string;
	/** When the key was provisioned */
	provisionedAt: number;
	/** Quotas applied to this key */
	quotas?: {
		maxTokensPerMonth?: number;
		maxRequestsPerDay?: number;
	};
};

/**
 * Storage format for AI provider keys
 */
export type AiProviderKeysStorage = {
	version: 1;
	keys: AiProviderKey[];
	updatedAt: number;
};

/**
 * Storage format for provisioned key mappings
 */
export type ProvisionedKeyMappingsStorage = {
	version: 1;
	mappings: ProvisionedKeyMapping[];
	updatedAt: number;
};

/**
 * Result of provisioning a new AI API key
 */
export type ProvisionKeyResult = {
	/** Provider's key ID (for tracking/revocation) */
	keyId: string;
	/** The actual API key (sensitive - only returned once) */
	key: string;
};

/**
 * Parameters for provisioning a new AI key
 */
export type ProvisionKeyParams = {
	/** Human-readable name for the key */
	name: string;
	/** Optional quotas to apply */
	quotas?: {
		maxTokensPerMonth?: number;
		maxRequestsPerDay?: number;
	};
};
