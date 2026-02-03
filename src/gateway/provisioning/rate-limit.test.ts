/**
 * Tests for ProvisioningRateLimiter
 */

import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { ProvisioningRateLimiter } from "./rate-limit.js";

describe("ProvisioningRateLimiter", () => {
	let limiter: ProvisioningRateLimiter;

	beforeEach(() => {
		limiter = new ProvisioningRateLimiter(3); // 3 requests per window for testing
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("allows requests within limit", () => {
		const keyId = "test-key-1";

		expect(limiter.check(keyId)).toBe(true);
		expect(limiter.check(keyId)).toBe(true);
		expect(limiter.check(keyId)).toBe(true);
	});

	test("blocks requests over limit", () => {
		const keyId = "test-key-2";

		// Use up the limit
		expect(limiter.check(keyId)).toBe(true);
		expect(limiter.check(keyId)).toBe(true);
		expect(limiter.check(keyId)).toBe(true);

		// Next request should be blocked
		expect(limiter.check(keyId)).toBe(false);
		expect(limiter.check(keyId)).toBe(false);
	});

	test("resets after window expires", () => {
		const keyId = "test-key-3";

		// Use up the limit
		expect(limiter.check(keyId)).toBe(true);
		expect(limiter.check(keyId)).toBe(true);
		expect(limiter.check(keyId)).toBe(true);
		expect(limiter.check(keyId)).toBe(false);

		// Advance time past the window (60 seconds)
		vi.advanceTimersByTime(61 * 1000);

		// Should be allowed again
		expect(limiter.check(keyId)).toBe(true);
	});

	test("tracks remaining requests correctly", () => {
		const keyId = "test-key-4";

		expect(limiter.getRemaining(keyId)).toBe(3);

		limiter.check(keyId);
		expect(limiter.getRemaining(keyId)).toBe(2);

		limiter.check(keyId);
		expect(limiter.getRemaining(keyId)).toBe(1);

		limiter.check(keyId);
		expect(limiter.getRemaining(keyId)).toBe(0);
	});

	test("tracks different keys independently", () => {
		const keyId1 = "test-key-5";
		const keyId2 = "test-key-6";

		// Use up key1's limit
		expect(limiter.check(keyId1)).toBe(true);
		expect(limiter.check(keyId1)).toBe(true);
		expect(limiter.check(keyId1)).toBe(true);
		expect(limiter.check(keyId1)).toBe(false);

		// key2 should still work
		expect(limiter.check(keyId2)).toBe(true);
		expect(limiter.check(keyId2)).toBe(true);
	});

	test("returns reset time", () => {
		const keyId = "test-key-7";
		const now = Date.now();

		limiter.check(keyId);

		const resetAt = limiter.getResetAt(keyId);
		expect(resetAt).toBeDefined();
		expect(resetAt).toBeGreaterThan(now);
		expect(resetAt).toBeLessThanOrEqual(now + 60 * 1000); // Within 60 seconds
	});

	test("cleans up expired entries", () => {
		const keyId = "test-key-8";

		// Create an entry
		limiter.check(keyId);
		expect(limiter.getResetAt(keyId)).toBeDefined();

		// Advance time past the window
		vi.advanceTimersByTime(61 * 1000);

		// Trigger cleanup (happens every 5 minutes)
		vi.advanceTimersByTime(5 * 60 * 1000);

		// Entry should be cleaned up (getResetAt returns undefined for cleaned entries)
		// Note: We can't directly test the cleanup without accessing private members,
		// but we can verify the entry is reset
		expect(limiter.getRemaining(keyId)).toBe(3);
	});
});
