import { describe, expect, it } from "vitest";
import {
  generatePairingToken,
  hashToken,
  isHashedToken,
  verifyPairingToken,
} from "./pairing-token.js";

describe("generatePairingToken", () => {
  it("generates a base64url token", () => {
    const token = generatePairingToken();
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(30);
    // base64url chars only
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generatePairingToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("hashToken", () => {
  it("produces a sha256-prefixed hex hash", () => {
    const hash = hashToken("test-token");
    expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("produces deterministic output", () => {
    const h1 = hashToken("same-input");
    const h2 = hashToken("same-input");
    expect(h1).toBe(h2);
  });

  it("produces different hashes for different inputs", () => {
    const h1 = hashToken("token-a");
    const h2 = hashToken("token-b");
    expect(h1).not.toBe(h2);
  });
});

describe("isHashedToken", () => {
  it("returns true for sha256-prefixed values", () => {
    expect(isHashedToken("sha256:abc123")).toBe(true);
  });

  it("returns false for plaintext values", () => {
    expect(isHashedToken("plaintext-token")).toBe(false);
    expect(isHashedToken("abc123")).toBe(false);
  });
});

describe("verifyPairingToken", () => {
  it("verifies against SHA-256 hashed stored value", () => {
    const plaintext = generatePairingToken();
    const hashed = hashToken(plaintext);
    expect(verifyPairingToken(plaintext, hashed)).toBe(true);
  });

  it("rejects wrong token against SHA-256 hash", () => {
    const plaintext = generatePairingToken();
    const hashed = hashToken(plaintext);
    expect(verifyPairingToken("wrong-token", hashed)).toBe(false);
  });

  it("verifies against legacy plaintext stored value (backward compat)", () => {
    const token = "legacy-plaintext-token";
    expect(verifyPairingToken(token, token)).toBe(true);
  });

  it("rejects wrong token against legacy plaintext", () => {
    expect(verifyPairingToken("wrong", "correct")).toBe(false);
  });

  it("full round-trip: generate → hash → verify", () => {
    const token = generatePairingToken();
    const stored = hashToken(token);
    expect(isHashedToken(stored)).toBe(true);
    expect(verifyPairingToken(token, stored)).toBe(true);
    expect(verifyPairingToken(token + "x", stored)).toBe(false);
  });
});
