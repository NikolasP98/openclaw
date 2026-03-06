import { parse, stringify } from "comment-json";

/**
 * Parse JSON/JSON5 string preserving comments as Symbol metadata.
 * Drop-in replacement for JSON5.parse that retains comment positions.
 */
export function parseWithComments(raw: string): unknown {
  return parse(raw);
}

/**
 * Serialize a value to JSON with comments restored in their original positions.
 * Drop-in replacement for JSON.stringify that outputs comments.
 */
export function stringifyWithComments(value: unknown, space?: number): string {
  return stringify(value, null, space);
}

/**
 * Copy comment Symbol metadata from a source object to a target object.
 * Only copies Symbol properties (where comment-json stores comments),
 * not data properties — so the target's values remain unchanged.
 *
 * Recurses into matching object keys so nested comments are preserved.
 */
export function transferComments(source: unknown, target: unknown): unknown {
  if (!source || typeof source !== "object" || !target || typeof target !== "object") {
    return target;
  }

  // Copy top-level comment Symbols from source to target
  for (const sym of Object.getOwnPropertySymbols(source)) {
    (target as Record<symbol, unknown>)[sym] = (source as Record<symbol, unknown>)[sym];
  }

  // Recurse into shared object keys
  const src = source as Record<string, unknown>;
  const tgt = target as Record<string, unknown>;
  for (const key of Object.keys(tgt)) {
    if (
      key in src &&
      src[key] &&
      typeof src[key] === "object" &&
      tgt[key] &&
      typeof tgt[key] === "object"
    ) {
      transferComments(src[key], tgt[key]);
    }
  }

  return target;
}
