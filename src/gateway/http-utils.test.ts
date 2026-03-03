/**
 * Tests for http-utils session key resolution, including Sprint U.1:
 * stable session ID derivation from first user message content.
 */
import { describe, expect, it } from "vitest";
import { deriveSessionIdFromContent } from "./http-utils.js";

describe("deriveSessionIdFromContent (Sprint U.1)", () => {
  it("returns an 8-character hex string", () => {
    const id = deriveSessionIdFromContent("hello world");
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic — same input produces same output", () => {
    const content = "How do I fix this TypeScript error?";
    expect(deriveSessionIdFromContent(content)).toBe(deriveSessionIdFromContent(content));
  });

  it("different inputs produce different IDs", () => {
    const id1 = deriveSessionIdFromContent("Hello, how are you?");
    const id2 = deriveSessionIdFromContent("Can you write a Python script?");
    expect(id1).not.toBe(id2);
  });

  it("is case-sensitive", () => {
    const lower = deriveSessionIdFromContent("hello");
    const upper = deriveSessionIdFromContent("Hello");
    expect(lower).not.toBe(upper);
  });

  it("handles empty string", () => {
    const id = deriveSessionIdFromContent("");
    expect(id).toHaveLength(8);
    expect(id).toMatch(/^[0-9a-f]+$/);
  });

  it("handles multi-line content", () => {
    const content = "Please analyze this code:\n\n```typescript\nconst x = 1;\n```";
    const id = deriveSessionIdFromContent(content);
    expect(id).toHaveLength(8);
    // Same content — same ID
    expect(deriveSessionIdFromContent(content)).toBe(id);
  });

  it("produces stable known hashes", () => {
    // Regression test: SHA-256("hello")[:8] = "2cf24dba"
    expect(deriveSessionIdFromContent("hello")).toBe("2cf24dba");
  });
});
