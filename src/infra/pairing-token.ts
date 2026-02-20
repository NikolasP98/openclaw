import { createHash, randomBytes } from "node:crypto";
import { safeEqualSecret } from "../security/secret-equal.js";

export const PAIRING_TOKEN_BYTES = 32;

/** Prefix for SHA-256 hashed tokens (to distinguish from legacy plaintext). */
const SHA256_PREFIX = "sha256:";

/**
 * Generate a cryptographically secure pairing token.
 * Returns a base64url-encoded random string.
 */
export function generatePairingToken(): string {
  return randomBytes(PAIRING_TOKEN_BYTES).toString("base64url");
}

/**
 * Hash a token using SHA-256 for safe at-rest storage.
 * Returns a prefixed hash string: "sha256:<hex>".
 */
export function hashToken(token: string): string {
  const hash = createHash("sha256").update(token).digest("hex");
  return `${SHA256_PREFIX}${hash}`;
}

/**
 * Check if a stored token value is a SHA-256 hash (vs legacy plaintext).
 */
export function isHashedToken(storedValue: string): boolean {
  return storedValue.startsWith(SHA256_PREFIX);
}

/**
 * Verify a provided token against a stored value.
 *
 * Supports both:
 * - SHA-256 hashed tokens: hash the provided token and compare hashes
 * - Legacy plaintext tokens: constant-time comparison (backward compatible)
 */
export function verifyPairingToken(provided: string, stored: string): boolean {
  if (isHashedToken(stored)) {
    // Hash the provided token and compare against stored hash
    const providedHash = hashToken(provided);
    return safeEqualSecret(providedHash, stored);
  }
  // Legacy plaintext comparison (backward compatibility)
  return safeEqualSecret(provided, stored);
}
