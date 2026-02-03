/**
 * Agent Provisioning Key Validation
 */

import { timingSafeEqual } from "node:crypto";
import type { AgentProvisioningKey, ProvisionScope } from "./types.js";

/**
 * Safely compare two strings in constant time to prevent timing attacks
 * (reuses pattern from auth.ts)
 */
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	const bufA = Buffer.from(a, "utf-8");
	const bufB = Buffer.from(b, "utf-8");
	return timingSafeEqual(bufA, bufB);
}

/**
 * Validate a provisioning key for a specific operation
 */
export function validateProvisioningKey(
	key: AgentProvisioningKey,
	providedKey: string,
	requiredScope: ProvisionScope,
): { valid: true } | { valid: false; reason: string } {
	// Check key matches (constant-time comparison)
	if (!safeEqual(key.key, providedKey)) {
		return { valid: false, reason: "Invalid provisioning key" };
	}

	// Check revocation
	if (key.revokedAt !== undefined) {
		return { valid: false, reason: "Provisioning key has been revoked" };
	}

	// Check expiration
	if (key.expiresAt !== undefined && Date.now() > key.expiresAt) {
		return { valid: false, reason: "Provisioning key has expired" };
	}

	// Check usage limit
	if (key.maxUses !== undefined && key.usesCount >= key.maxUses) {
		return {
			valid: false,
			reason: `Provisioning key has reached usage limit (${key.maxUses})`,
		};
	}

	// Check scope
	if (!key.scopes.includes(requiredScope)) {
		return {
			valid: false,
			reason: `Provisioning key lacks required scope: ${requiredScope}`,
		};
	}

	return { valid: true };
}
