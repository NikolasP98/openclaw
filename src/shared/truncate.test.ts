import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import { truncateBytes, truncateText } from "./truncate.js";

// ---------------------------------------------------------------------------
// truncateText — character-based
// ---------------------------------------------------------------------------

describe("truncateText", () => {
  it("returns text unchanged when within limit", () => {
    expect(truncateText("hello", 10)).toBe("hello");
    expect(truncateText("hello", 5)).toBe("hello");
  });

  it("truncates and appends default ellipsis suffix", () => {
    const result = truncateText("hello world", 6);
    expect(result).toBe("hello\u2026");
    expect(result.length).toBeLessThanOrEqual(6);
  });

  it("respects custom suffix", () => {
    const result = truncateText("hello world", 8, { suffix: "..." });
    expect(result).toBe("hello...");
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it("handles empty suffix", () => {
    const result = truncateText("hello world", 5, { suffix: "" });
    expect(result).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(truncateText("", 10)).toBe("");
  });

  it("returns empty string for maxChars <= 0", () => {
    expect(truncateText("hello", 0)).toBe("");
    expect(truncateText("hello", -1)).toBe("");
  });

  it("handles maxChars shorter than suffix — hard slice, no suffix", () => {
    // Default suffix is "…" (1 char), so maxChars=1 means budget=0 for body
    // but the suffix itself is 1 char long, so maxChars <= suffix.length → hard slice
    const result = truncateText("abcdef", 1);
    expect(result.length).toBeLessThanOrEqual(1);
    expect(result).toBe("a");
  });

  it("handles maxChars equal to suffix length — hard slice", () => {
    // With suffix "..." (3 chars) and maxChars=3: bodyBudget would be 0
    const result = truncateText("abcdef", 3, { suffix: "..." });
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result).toBe("abc");
  });

  it("does not split a surrogate pair at the cut point", () => {
    // 🎉 is a surrogate pair (2 code units)
    const text = "a\u{1F389}b"; // "a🎉b" — length 4 (a + high + low + b)
    // Cut at maxChars=3: body budget = 3 - 1(suffix) = 2
    // Position 1 is the high surrogate of 🎉 — slicing at 2 would orphan
    // the low surrogate. safeSlice should step back to 1.
    const result = truncateText(text, 3);
    expect(result.length).toBeLessThanOrEqual(3);
    // Should not contain a lone surrogate
    expect(Buffer.from(result).toString()).toBe(result);
  });

  it("handles text that is exactly maxChars", () => {
    expect(truncateText("abcde", 5)).toBe("abcde");
  });

  it("handles single character truncation", () => {
    // "ab" with maxChars=1: too small for suffix, hard slice
    expect(truncateText("ab", 1)).toBe("a");
  });
});

// ---------------------------------------------------------------------------
// truncateBytes — byte-based
// ---------------------------------------------------------------------------

describe("truncateBytes", () => {
  it("returns text unchanged when within byte limit", () => {
    expect(truncateBytes("hello", 10)).toBe("hello");
    expect(truncateBytes("hello", 5)).toBe("hello");
  });

  it("truncates ASCII text and appends default suffix", () => {
    // "hello world" = 11 bytes, suffix "…" = 3 bytes
    const result = truncateBytes("hello world", 8);
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(8);
    expect(result).toContain("\u2026");
  });

  it("respects custom suffix", () => {
    const result = truncateBytes("hello world", 8, { suffix: "..." });
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(8);
    expect(result).toContain("...");
  });

  it("returns empty string for empty input", () => {
    expect(truncateBytes("", 10)).toBe("");
  });

  it("returns empty string for maxBytes <= 0", () => {
    expect(truncateBytes("hello", 0)).toBe("");
    expect(truncateBytes("hello", -1)).toBe("");
  });

  it("does not split multibyte characters", () => {
    // "héllo" — 'é' is 2 bytes in UTF-8
    const text = "h\u00e9llo"; // "héllo" = 6 bytes (h=1, é=2, l=1, l=1, o=1)
    // With maxBytes=4: suffix "…"=3 bytes, bodyBudget=1 byte → "h" + "…"
    const result = truncateBytes(text, 4);
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(4);
    // Must not contain a broken multibyte sequence
    const roundTripped = Buffer.from(result, "utf8").toString("utf8");
    expect(roundTripped).toBe(result);
  });

  it("handles emoji (4-byte UTF-8 characters)", () => {
    // "🎉🎊" — each emoji is 4 bytes in UTF-8
    const text = "\u{1F389}\u{1F38A}"; // 8 bytes total
    // maxBytes=7: suffix "…"=3 bytes, bodyBudget=4 → fits one emoji
    const result = truncateBytes(text, 7);
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(7);
    expect(result).toBe("\u{1F389}\u2026");
  });

  it("handles maxBytes smaller than suffix — hard slice, no suffix", () => {
    // Default suffix "…" = 3 bytes. maxBytes=2 → hard slice
    const result = truncateBytes("abcdef", 2);
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(2);
    expect(result).toBe("ab");
  });

  it("handles text that fits exactly", () => {
    const text = "hello"; // 5 bytes
    expect(truncateBytes(text, 5)).toBe("hello");
  });

  it("handles CJK characters (3 bytes each in UTF-8)", () => {
    // "你好世界" — each character is 3 bytes → 12 bytes total
    const text = "\u4f60\u597d\u4e16\u754c";
    // maxBytes=9: suffix "…"=3 bytes, bodyBudget=6 → fits 2 CJK chars
    const result = truncateBytes(text, 9);
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(9);
    expect(result).toBe("\u4f60\u597d\u2026");
  });

  it("handles empty suffix", () => {
    const result = truncateBytes("hello world", 5, { suffix: "" });
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(5);
    expect(result).toBe("hello");
  });
});
