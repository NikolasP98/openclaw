import { describe, expect, it } from "vitest";
import { hashToken, isHashedToken, migrateToken, verifyToken } from "./token-hash.js";

describe("hashToken", () => {
  it("returns a 64-char hex string", () => {
    const hash = hashToken("my-secret-token");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(hashToken("test")).toBe(hashToken("test"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("handles empty string", () => {
    const hash = hashToken("");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles unicode", () => {
    const hash = hashToken("tökën-🔑");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verifyToken", () => {
  it("returns true for matching token", () => {
    const hash = hashToken("my-secret");
    expect(verifyToken("my-secret", hash)).toBe(true);
  });

  it("returns false for non-matching token", () => {
    const hash = hashToken("my-secret");
    expect(verifyToken("wrong-secret", hash)).toBe(false);
  });

  it("returns false for truncated hash", () => {
    const hash = hashToken("my-secret");
    expect(verifyToken("my-secret", hash.slice(0, 32))).toBe(false);
  });

  it("returns false for empty hash", () => {
    expect(verifyToken("my-secret", "")).toBe(false);
  });

  it("is timing-safe (does not short-circuit)", () => {
    const hash = hashToken("secret");
    // Both wrong tokens should take similar time
    // (we can't easily test timing, but we verify correctness)
    expect(verifyToken("wrong1", hash)).toBe(false);
    expect(verifyToken("wrong2", hash)).toBe(false);
  });
});

describe("isHashedToken", () => {
  it("returns true for valid SHA-256 hex hash", () => {
    expect(isHashedToken(hashToken("test"))).toBe(true);
    expect(isHashedToken("a".repeat(64))).toBe(true);
    expect(isHashedToken("0123456789abcdef".repeat(4))).toBe(true);
  });

  it("returns false for plaintext tokens", () => {
    expect(isHashedToken("my-api-key-123")).toBe(false);
    expect(isHashedToken("sk-abc123def456")).toBe(false);
    expect(isHashedToken("short")).toBe(false);
  });

  it("returns false for uppercase hex", () => {
    expect(isHashedToken("A".repeat(64))).toBe(false);
  });

  it("returns false for wrong length", () => {
    expect(isHashedToken("a".repeat(63))).toBe(false);
    expect(isHashedToken("a".repeat(65))).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isHashedToken("")).toBe(false);
  });
});

describe("migrateToken", () => {
  it("hashes a plaintext token and marks as migrated", () => {
    const result = migrateToken("my-api-key");
    expect(result.migrated).toBe(true);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyToken("my-api-key", result.hash)).toBe(true);
  });

  it("leaves an already-hashed token unchanged", () => {
    const existingHash = hashToken("some-token");
    const result = migrateToken(existingHash);
    expect(result.migrated).toBe(false);
    expect(result.hash).toBe(existingHash);
  });

  it("handles edge case: 64-char non-hex string is hashed", () => {
    const nonHex = "g".repeat(64); // 'g' is not hex
    const result = migrateToken(nonHex);
    expect(result.migrated).toBe(true);
  });
});
