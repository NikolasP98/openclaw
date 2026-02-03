/**
 * Audit Logging for Provisioning Operations
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProvisioningAuditEntry } from "./types.js";

/**
 * Append audit entry to JSONL log file
 */
export async function auditLog(
	filePath: string,
	entry: Omit<ProvisioningAuditEntry, "timestamp">,
): Promise<void> {
	try {
		// Ensure directory exists
		await mkdir(dirname(filePath), { recursive: true });

		// Create full entry with timestamp
		const fullEntry: ProvisioningAuditEntry = {
			timestamp: Date.now(),
			...entry,
		};

		// Append as JSON line
		await appendFile(filePath, JSON.stringify(fullEntry) + "\n", "utf-8");
	} catch (error) {
		// Don't throw - audit logging failures shouldn't break operations
		console.error("Failed to write audit log:", error);
	}
}

/**
 * Create audit entry for successful operation
 */
export function auditSuccess(
	keyId: string,
	operation: string,
	remoteIp?: string,
	agentId?: string,
): Omit<ProvisioningAuditEntry, "timestamp"> {
	return {
		keyId,
		operation,
		result: "success",
		remoteIp,
		agentId,
	};
}

/**
 * Create audit entry for failed operation
 */
export function auditError(
	keyId: string,
	operation: string,
	error: string,
	remoteIp?: string,
	agentId?: string,
): Omit<ProvisioningAuditEntry, "timestamp"> {
	return {
		keyId,
		operation,
		result: "error",
		error,
		remoteIp,
		agentId,
	};
}
