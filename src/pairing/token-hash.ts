/**
 * Token hashing — SHA-256 hashing with timing-safe comparison.
 *
 * Provides secure token storage by hashing plaintext tokens before
 * persisting them. Uses timing-safe comparison to prevent timing attacks
 * when verifying tokens.
 *
 * @module
 */

import crypto from "node:crypto";

// ── Constants ────────────────────────────────────────────────────────────────

const HASH_ALGORITHM = "sha256";
const HASH_ENCODING = "hex" as const;

// ── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Hash a plaintext token using SHA-256.
 *
 * Returns a hex-encoded hash string suitable for storage.
 */
export function hashToken(plaintext: string): string {
  return crypto.createHash(HASH_ALGORITHM).update(plaintext, "utf-8").digest(HASH_ENCODING);
}

/**
 * Verify a plaintext token against a stored SHA-256 hash.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyToken(plaintext: string, storedHash: string): boolean {
  const candidateHash = hashToken(plaintext);
  if (candidateHash.length !== storedHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(candidateHash, "utf-8"),
    Buffer.from(storedHash, "utf-8"),
  );
}

/**
 * Check if a stored value looks like a SHA-256 hex hash (64 hex chars).
 *
 * Used during migration to detect whether a stored token is already
 * hashed or still plaintext.
 */
export function isHashedToken(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/**
 * Migrate a token: if it's plaintext, hash it. If already hashed, return as-is.
 *
 * Returns `{ hash, migrated }` — migrated is true if the value was converted.
 */
export function migrateToken(value: string): { hash: string; migrated: boolean } {
  if (isHashedToken(value)) {
    return { hash: value, migrated: false };
  }
  return { hash: hashToken(value), migrated: true };
}
