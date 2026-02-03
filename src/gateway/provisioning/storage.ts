/**
 * Storage for Agent Provisioning Keys
 */

import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentProvisioningKey, AgentProvisioningKeysStorage } from "./types.js";

/**
 * Load agent provisioning keys from storage
 */
export async function loadAgentProvisioningKeys(
	filePath: string,
): Promise<AgentProvisioningKey[]> {
	try {
		const content = await readFile(filePath, "utf-8");
		const storage: AgentProvisioningKeysStorage = JSON.parse(content);

		if (storage.version !== 1) {
			throw new Error(
				`Unsupported agent provisioning keys storage version: ${storage.version}`,
			);
		}

		return storage.keys;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

/**
 * Save agent provisioning keys to storage
 */
export async function saveAgentProvisioningKeys(
	filePath: string,
	keys: AgentProvisioningKey[],
): Promise<void> {
	const storage: AgentProvisioningKeysStorage = {
		version: 1,
		keys,
		updatedAt: Date.now(),
	};

	// Ensure directory exists
	await mkdir(dirname(filePath), { recursive: true });

	// Write to temp file first (atomic write)
	const tmpPath = `${filePath}.tmp`;
	await writeFile(tmpPath, JSON.stringify(storage, null, 2), "utf-8");

	// Set restrictive permissions (owner read/write only)
	await chmod(tmpPath, 0o600);

	// Rename to final path (atomic on POSIX)
	await writeFile(filePath, await readFile(tmpPath));
	await chmod(filePath, 0o600);
}

/**
 * Get agent provisioning key by ID
 */
export async function getAgentProvisioningKeyById(
	filePath: string,
	keyId: string,
): Promise<AgentProvisioningKey | undefined> {
	const keys = await loadAgentProvisioningKeys(filePath);
	return keys.find((k) => k.id === keyId);
}

/**
 * Get agent provisioning key by key string
 */
export async function getAgentProvisioningKeyByKey(
	filePath: string,
	key: string,
): Promise<AgentProvisioningKey | undefined> {
	const keys = await loadAgentProvisioningKeys(filePath);
	return keys.find((k) => k.key === key);
}

/**
 * Add new agent provisioning key
 */
export async function addAgentProvisioningKey(
	filePath: string,
	key: AgentProvisioningKey,
): Promise<void> {
	const keys = await loadAgentProvisioningKeys(filePath);

	// Check for duplicate ID or key
	if (keys.some((k) => k.id === key.id)) {
		throw new Error(`Agent provisioning key with ID ${key.id} already exists`);
	}
	if (keys.some((k) => k.key === key.key)) {
		throw new Error("Agent provisioning key already exists");
	}

	keys.push(key);
	await saveAgentProvisioningKeys(filePath, keys);
}

/**
 * Update agent provisioning key
 */
export async function updateAgentProvisioningKey(
	filePath: string,
	keyId: string,
	updates: Partial<AgentProvisioningKey>,
): Promise<boolean> {
	const keys = await loadAgentProvisioningKeys(filePath);
	const index = keys.findIndex((k) => k.id === keyId);

	if (index === -1) {
		return false;
	}

	keys[index] = { ...keys[index], ...updates };
	await saveAgentProvisioningKeys(filePath, keys);
	return true;
}

/**
 * Remove agent provisioning key by ID
 */
export async function removeAgentProvisioningKey(
	filePath: string,
	keyId: string,
): Promise<boolean> {
	const keys = await loadAgentProvisioningKeys(filePath);
	const filteredKeys = keys.filter((k) => k.id !== keyId);

	if (filteredKeys.length === keys.length) {
		return false;
	}

	await saveAgentProvisioningKeys(filePath, filteredKeys);
	return true;
}

/**
 * Increment usage count for a key
 */
export async function incrementKeyUsage(
	filePath: string,
	keyId: string,
): Promise<void> {
	await updateAgentProvisioningKey(filePath, keyId, {
		usesCount: (await getAgentProvisioningKeyById(filePath, keyId))!.usesCount + 1,
		lastUsedAt: Date.now(),
	});
}
