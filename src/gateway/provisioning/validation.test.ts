/**
 * Tests for provisioning key validation
 */

import { describe, test, expect } from "vitest";
import { validateProvisioningKey } from "./validation.js";
import type { AgentProvisioningKey } from "./types.js";
import { randomBytes } from "node:crypto";

describe("validateProvisioningKey", () => {
	const generateKey = (): string => randomBytes(48).toString("hex");

	const createTestKey = (overrides?: Partial<AgentProvisioningKey>): AgentProvisioningKey => ({
		id: "test-key-id",
		key: generateKey(),
		scopes: ["agents:create"],
		createdAt: Date.now(),
		usesCount: 0,
		...overrides,
	});

	test("validates a valid key with matching scope", () => {
		const key = createTestKey();
		const result = validateProvisioningKey(key, key.key, "agents:create");

		expect(result.valid).toBe(true);
	});

	test("rejects key with incorrect value", () => {
		const key = createTestKey();
		const wrongKey = generateKey();
		const result = validateProvisioningKey(key, wrongKey, "agents:create");

		expect(result.valid).toBe(false);
		expect(result.reason).toBe("Invalid provisioning key");
	});

	test("rejects revoked key", () => {
		const key = createTestKey({
			revokedAt: Date.now() - 1000,
		});
		const result = validateProvisioningKey(key, key.key, "agents:create");

		expect(result.valid).toBe(false);
		expect(result.reason).toBe("Provisioning key has been revoked");
	});

	test("rejects expired key", () => {
		const key = createTestKey({
			expiresAt: Date.now() - 1000,
		});
		const result = validateProvisioningKey(key, key.key, "agents:create");

		expect(result.valid).toBe(false);
		expect(result.reason).toBe("Provisioning key has expired");
	});

	test("accepts key before expiration", () => {
		const key = createTestKey({
			expiresAt: Date.now() + 60 * 1000, // Expires in 60 seconds
		});
		const result = validateProvisioningKey(key, key.key, "agents:create");

		expect(result.valid).toBe(true);
	});

	test("rejects key that reached usage limit", () => {
		const key = createTestKey({
			maxUses: 10,
			usesCount: 10,
		});
		const result = validateProvisioningKey(key, key.key, "agents:create");

		expect(result.valid).toBe(false);
		expect(result.reason).toContain("reached usage limit");
	});

	test("accepts key below usage limit", () => {
		const key = createTestKey({
			maxUses: 10,
			usesCount: 5,
		});
		const result = validateProvisioningKey(key, key.key, "agents:create");

		expect(result.valid).toBe(true);
	});

	test("accepts key with unlimited uses", () => {
		const key = createTestKey({
			maxUses: undefined,
			usesCount: 1000,
		});
		const result = validateProvisioningKey(key, key.key, "agents:create");

		expect(result.valid).toBe(true);
	});

	test("rejects key without required scope", () => {
		const key = createTestKey({
			scopes: ["agents:create"],
		});
		const result = validateProvisioningKey(key, key.key, "agents:delete");

		expect(result.valid).toBe(false);
		expect(result.reason).toContain("lacks required scope");
	});

	test("accepts key with required scope among multiple scopes", () => {
		const key = createTestKey({
			scopes: ["agents:create", "agents:delete", "agents:onboard"],
		});
		const result = validateProvisioningKey(key, key.key, "agents:delete");

		expect(result.valid).toBe(true);
	});

	test("uses constant-time comparison for keys", () => {
		// This test verifies that validation doesn't leak timing information
		const key = createTestKey();
		const wrongKey1 = "a".repeat(96); // Same length, different content
		const wrongKey2 = key.key.slice(0, -1) + "x"; // One character different

		const start1 = process.hrtime.bigint();
		validateProvisioningKey(key, wrongKey1, "agents:create");
		const time1 = process.hrtime.bigint() - start1;

		const start2 = process.hrtime.bigint();
		validateProvisioningKey(key, wrongKey2, "agents:create");
		const time2 = process.hrtime.bigint() - start2;

		// Times should be similar (within 50% of each other)
		// Note: This is a basic timing test and not cryptographically rigorous
		const ratio = Number(time1) / Number(time2);
		expect(ratio).toBeGreaterThan(0.5);
		expect(ratio).toBeLessThan(2.0);
	});
});
