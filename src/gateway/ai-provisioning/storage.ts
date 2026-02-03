/**
 * Storage for AI Provider Provisioning Keys and Mappings
 */

import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import type {
	AiProviderKey,
	AiProviderKeysStorage,
	ProvisionedKeyMapping,
	ProvisionedKeyMappingsStorage,
} from "./types.js";

/**
 * Load AI provider keys from storage
 */
export async function loadAiProviderKeys(filePath: string): Promise<AiProviderKey[]> {
	try {
		const content = await readFile(filePath, "utf-8");
		const storage: AiProviderKeysStorage = JSON.parse(content);

		if (storage.version !== 1) {
			throw new Error(`Unsupported AI provider keys storage version: ${storage.version}`);
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
 * Save AI provider keys to storage
 */
export async function saveAiProviderKeys(
	filePath: string,
	keys: AiProviderKey[],
): Promise<void> {
	const storage: AiProviderKeysStorage = {
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
 * Load provisioned key mappings from storage
 */
export async function loadProvisionedKeyMappings(
	filePath: string,
): Promise<ProvisionedKeyMapping[]> {
	try {
		const content = await readFile(filePath, "utf-8");
		const storage: ProvisionedKeyMappingsStorage = JSON.parse(content);

		if (storage.version !== 1) {
			throw new Error(`Unsupported key mappings storage version: ${storage.version}`);
		}

		return storage.mappings;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}
		throw error;
	}
}

/**
 * Save provisioned key mappings to storage
 */
export async function saveProvisionedKeyMappings(
	filePath: string,
	mappings: ProvisionedKeyMapping[],
): Promise<void> {
	const storage: ProvisionedKeyMappingsStorage = {
		version: 1,
		mappings,
		updatedAt: Date.now(),
	};

	// Ensure directory exists
	await mkdir(dirname(filePath), { recursive: true });

	// Write to temp file first (atomic write)
	const tmpPath = `${filePath}.tmp`;
	await writeFile(tmpPath, JSON.stringify(storage, null, 2), "utf-8");

	// Set restrictive permissions
	await chmod(tmpPath, 0o600);

	// Rename to final path
	await writeFile(filePath, await readFile(tmpPath));
	await chmod(filePath, 0o600);
}

/**
 * Get AI provider key by ID
 */
export async function getAiProviderKeyById(
	filePath: string,
	keyId: string,
): Promise<AiProviderKey | undefined> {
	const keys = await loadAiProviderKeys(filePath);
	return keys.find((k) => k.id === keyId);
}

/**
 * Add new AI provider key
 */
export async function addAiProviderKey(
	filePath: string,
	key: AiProviderKey,
): Promise<void> {
	const keys = await loadAiProviderKeys(filePath);

	// Check for duplicate ID
	if (keys.some((k) => k.id === key.id)) {
		throw new Error(`AI provider key with ID ${key.id} already exists`);
	}

	keys.push(key);
	await saveAiProviderKeys(filePath, keys);
}

/**
 * Remove AI provider key by ID
 */
export async function removeAiProviderKey(filePath: string, keyId: string): Promise<boolean> {
	const keys = await loadAiProviderKeys(filePath);
	const filteredKeys = keys.filter((k) => k.id !== keyId);

	if (filteredKeys.length === keys.length) {
		return false;
	}

	await saveAiProviderKeys(filePath, filteredKeys);
	return true;
}

/**
 * Add provisioned key mapping
 */
export async function addProvisionedKeyMapping(
	filePath: string,
	mapping: ProvisionedKeyMapping,
): Promise<void> {
	const mappings = await loadProvisionedKeyMappings(filePath);
	mappings.push(mapping);
	await saveProvisionedKeyMappings(filePath, mappings);
}

/**
 * Get provisioned key mappings for an agent
 */
export async function getProvisionedKeyMappingsForAgent(
	filePath: string,
	agentId: string,
): Promise<ProvisionedKeyMapping[]> {
	const mappings = await loadProvisionedKeyMappings(filePath);
	return mappings.filter((m) => m.agentId === agentId);
}

/**
 * Remove provisioned key mappings for an agent
 */
export async function removeProvisionedKeyMappingsForAgent(
	filePath: string,
	agentId: string,
): Promise<number> {
	const mappings = await loadProvisionedKeyMappings(filePath);
	const filteredMappings = mappings.filter((m) => m.agentId !== agentId);
	const removedCount = mappings.length - filteredMappings.length;

	if (removedCount > 0) {
		await saveProvisionedKeyMappings(filePath, filteredMappings);
	}

	return removedCount;
}
