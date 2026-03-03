import { describe, expect, it } from "vitest";
import { getModelContextWindow, modelFitsContext } from "./model-catalog.js";

describe("getModelContextWindow", () => {
  it("returns exact match for known model", () => {
    expect(getModelContextWindow("claude-sonnet-4")).toBe(200_000);
    expect(getModelContextWindow("gpt-4o")).toBe(128_000);
    expect(getModelContextWindow("qwen3:1.7b")).toBe(4_096);
  });

  it("is case-insensitive", () => {
    expect(getModelContextWindow("Claude-Sonnet-4")).toBe(200_000);
    expect(getModelContextWindow("GPT-4O")).toBe(128_000);
  });

  it("matches by prefix for versioned models", () => {
    expect(getModelContextWindow("gpt-4o-2024-08-06")).toBe(128_000);
    expect(getModelContextWindow("claude-sonnet-4-20250514")).toBe(200_000);
  });

  it("returns undefined for unknown models", () => {
    expect(getModelContextWindow("totally-unknown-model")).toBeUndefined();
  });
});

describe("modelFitsContext", () => {
  it("returns true when context window exceeds estimated tokens by 1.1x", () => {
    // qwen3:1.7b has 4096 context. 3000 * 1.1 = 3300 < 4096
    expect(modelFitsContext("qwen3:1.7b", 3000)).toBe(true);
  });

  it("returns false when estimated tokens exceed context window margin", () => {
    // qwen3:1.7b has 4096 context. 4000 * 1.1 = 4400 > 4096
    expect(modelFitsContext("qwen3:1.7b", 4000)).toBe(false);
  });

  it("returns true for unknown models (fail-open)", () => {
    expect(modelFitsContext("unknown-model", 999_999)).toBe(true);
  });

  it("handles edge case at exact boundary", () => {
    // qwen3:1.7b = 4096 context. 3723 * 1.1 = 4095.3 < 4096 → true
    expect(modelFitsContext("qwen3:1.7b", 3723)).toBe(true);
    // 3724 * 1.1 = 4096.4 > 4096 → false
    expect(modelFitsContext("qwen3:1.7b", 3724)).toBe(false);
  });

  it("returns true for zero estimated tokens", () => {
    expect(modelFitsContext("qwen3:1.7b", 0)).toBe(true);
  });
});
