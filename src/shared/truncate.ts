/**
 * Unified string truncation utilities.
 *
 * The codebase has ~15 local truncation helpers with subtly different
 * suffix strings ("...", "\u2026", none) and boundary semantics.
 * This module provides two canonical primitives:
 *
 *   - `truncateText`  – character-based truncation (JS string length)
 *   - `truncateBytes`  – byte-based truncation (UTF-8 via Buffer.byteLength)
 *
 * Both are safe with empty strings, surrogate pairs, and edge-case limits.
 *
 * Migration plan: new code should import from here. Existing callsites can
 * be migrated incrementally (tracked separately).
 */

import { Buffer } from "node:buffer";

/** Default suffix appended when text is truncated. */
const DEFAULT_SUFFIX = "\u2026"; // single unicode ellipsis

// ---------------------------------------------------------------------------
// Character-based truncation
// ---------------------------------------------------------------------------

export interface TruncateTextOptions {
  /** String appended after the cut. Defaults to "\u2026" (single unicode ellipsis). */
  suffix?: string;
}

/**
 * Truncate `text` to at most `maxChars` characters (JS `.length`).
 *
 * When truncation is needed the result is `text[0..cutPoint] + suffix`,
 * whose total length is at most `maxChars`.
 *
 * Edge cases handled:
 * - Empty string → returned as-is (never appends a suffix).
 * - `maxChars <= 0` → returns `""`.
 * - `maxChars` shorter than the suffix → returns a hard slice with no suffix.
 * - Surrogate pairs: avoids splitting a surrogate pair at the cut point.
 */
export function truncateText(text: string, maxChars: number, opts?: TruncateTextOptions): string {
  if (!text || maxChars <= 0) {
    return "";
  }
  if (text.length <= maxChars) {
    return text;
  }

  const suffix = opts?.suffix ?? DEFAULT_SUFFIX;

  // If the budget is too small to fit even the suffix, hard-slice without it.
  if (maxChars <= suffix.length) {
    return safeSlice(text, maxChars);
  }

  const bodyBudget = maxChars - suffix.length;
  return safeSlice(text, bodyBudget) + suffix;
}

// ---------------------------------------------------------------------------
// Byte-based truncation
// ---------------------------------------------------------------------------

export interface TruncateBytesOptions {
  /** String appended after the cut. Defaults to "\u2026" (single unicode ellipsis). */
  suffix?: string;
}

/**
 * Truncate `text` so the resulting UTF-8 byte length is at most `maxBytes`.
 *
 * This is important for protocols with byte-level limits (e.g. WebSocket
 * close reason frames are limited to 123 bytes).
 *
 * The suffix is accounted for in the byte budget. When truncation is needed
 * the function walks backwards from the approximate cut point to avoid
 * splitting a multibyte UTF-8 sequence.
 *
 * Edge cases handled:
 * - Empty string → returned as-is.
 * - `maxBytes <= 0` → returns `""`.
 * - `maxBytes` smaller than the suffix byte length → hard slice, no suffix.
 * - Multibyte characters at the boundary are dropped rather than corrupted.
 */
export function truncateBytes(text: string, maxBytes: number, opts?: TruncateBytesOptions): string {
  if (!text || maxBytes <= 0) {
    return "";
  }
  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return text;
  }

  const suffix = opts?.suffix ?? DEFAULT_SUFFIX;
  const suffixBytes = Buffer.byteLength(suffix, "utf8");

  // If the budget is too small to fit even the suffix, hard-slice bytes with no suffix.
  if (maxBytes <= suffixBytes) {
    return sliceToByteLimit(text, maxBytes);
  }

  const bodyBudget = maxBytes - suffixBytes;
  return sliceToByteLimit(text, bodyBudget) + suffix;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Slice `text` to at most `maxChars` characters, avoiding splitting a
 * UTF-16 surrogate pair.
 */
function safeSlice(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }
  const limit = Math.min(maxChars, text.length);

  // If the character just before the cut is a high surrogate, step back one
  // to avoid orphaning it.
  let end = limit;
  if (end > 0 && end < text.length) {
    const code = text.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate – its low surrogate would be cut off, so back up.
      end -= 1;
    }
  }
  return text.slice(0, end);
}

/**
 * Return the longest prefix of `text` whose UTF-8 encoding fits in
 * `maxBytes`, without splitting a multibyte character.
 *
 * Uses binary search over character positions for O(log n) Buffer.byteLength
 * calls instead of linear walk-back.
 */
function sliceToByteLimit(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return "";
  }

  if (Buffer.byteLength(text, "utf8") <= maxBytes) {
    return text;
  }

  // Binary search for the largest `end` where slice fits in `maxBytes`.
  // Each char is 1-4 bytes in UTF-8, so maxBytes is the upper bound on chars.
  let lo = 0;
  let hi = Math.min(text.length, maxBytes); // can't need more chars than bytes

  while (lo < hi) {
    const mid = lo + Math.ceil((hi - lo) / 2);
    if (Buffer.byteLength(text.slice(0, mid), "utf8") <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  let end = lo;

  // Avoid splitting a surrogate pair.
  if (end > 0 && end < text.length) {
    const code = text.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
      end -= 1;
    }
  }

  return text.slice(0, end);
}
