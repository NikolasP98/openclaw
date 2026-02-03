/**
 * Agent Provisioning Key System
 *
 * Manages authorization keys for agent creation and onboarding operations
 */

export type ProvisionScope =
	| "agents:create"
	| "agents:delete"
	| "agents:configure"
	| "agents:onboard";

/**
 * Agent provisioning key for authorizing agent management operations
 */
export type AgentProvisioningKey = {
	/** UUID */
	id: string;
	/** 48-byte hex token (96 characters) */
	key: string;
	/** Human-readable label */
	name?: string;
	/** Scopes this key grants */
	scopes: ProvisionScope[];
	/** Creation timestamp */
	createdAt: number;
	/** Optional expiration timestamp */
	expiresAt?: number;
	/** Maximum number of uses (undefined = unlimited) */
	maxUses?: number;
	/** Current usage count */
	usesCount: number;
	/** Last used timestamp */
	lastUsedAt?: number;
	/** Revocation timestamp */
	revokedAt?: number;
	/** Linked AI provider key ID (for auto-provisioning) */
	aiProviderKeyId?: string;
};

/**
 * Storage format for agent provisioning keys
 */
export type AgentProvisioningKeysStorage = {
	version: 1;
	keys: AgentProvisioningKey[];
	updatedAt: number;
};

/**
 * Audit log entry for provisioning operations
 */
export type ProvisioningAuditEntry = {
	timestamp: number;
	keyId: string;
	operation: string;
	result: "success" | "error";
	error?: string;
	remoteIp?: string;
	agentId?: string;
};
