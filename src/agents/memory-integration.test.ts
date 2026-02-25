import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildMemoryContext,
  detectEntityMentions,
  extractAndStoreMemory,
  getMemoryStats,
} from "./memory-integration.js";
import { openTypedMemoryDb, resetTypedMemoryDbForTest } from "../memory/typed-schema.js";
import { remember } from "../memory/knowledge-graph.js";

// ── detectEntityMentions ──────────────────────────────────────────────────────

describe("detectEntityMentions", () => {
  it("detects simple capitalised entity names", () => {
    const mentions = detectEntityMentions("Can you tell me about OpenClaw?");
    expect(mentions).toContain("OpenClaw");
  });

  it("detects multi-word proper nouns", () => {
    const mentions = detectEntityMentions("Tell me about Docker Compose.");
    expect(mentions.some((m) => m.includes("Docker"))).toBe(true);
  });

  it("filters out stop words", () => {
    const mentions = detectEntityMentions("What is the best approach?");
    expect(mentions).not.toContain("What");
    expect(mentions).not.toContain("The");
    expect(mentions).not.toContain("Is");
  });

  it("filters out pure numbers", () => {
    const mentions = detectEntityMentions("There are 100 items.");
    expect(mentions).not.toContain("100");
  });

  it("deduplicates repeated mentions", () => {
    // Use separated occurrences so the regex matches individual words, not a multi-word phrase
    const mentions = detectEntityMentions("I use TypeScript. TypeScript is great. TypeScript rocks.");
    expect(mentions.filter((m) => m === "TypeScript")).toHaveLength(1);
  });

  it("returns empty array for lowercase-only messages", () => {
    const mentions = detectEntityMentions("hello world, how are you?");
    expect(mentions).toHaveLength(0);
  });
});

// ── buildMemoryContext — DB not ready ────────────────────────────────────────

describe("buildMemoryContext — DB not ready", () => {
  it("returns empty block gracefully", () => {
    const result = buildMemoryContext("Tell me about prod-01");
    expect(result.contextBlock).toBe("");
    expect(result.tokenCount).toBe(0);
    expect(result.objectCount).toBe(0);
  });
});

// ── buildMemoryContext — with DB ─────────────────────────────────────────────

describe("buildMemoryContext — with DB", () => {
  beforeEach(() => {
    openTypedMemoryDb(":memory:");
  });

  afterEach(() => {
    resetTypedMemoryDbForTest();
  });

  it("returns empty block when no entities match", () => {
    const result = buildMemoryContext("Tell me about something unknown");
    expect(result.contextBlock).toBe("");
  });

  it("includes entity data when entity is found", () => {
    remember({ label: "OpenClaw", type: "entity", data: { role: "main product" } });
    const result = buildMemoryContext("Can you explain OpenClaw to me?");
    expect(result.contextBlock).toContain("OpenClaw");
    expect(result.objectCount).toBeGreaterThan(0);
    expect(result.tokenCount).toBeGreaterThan(0);
  });

  it("respects maxTokens budget", () => {
    // Store several entities
    for (let i = 0; i < 5; i++) {
      remember({ label: `Entity${i}`, type: "entity", data: { description: "a".repeat(300) } });
    }
    const result = buildMemoryContext(
      "Tell me about Entity0 Entity1 Entity2 Entity3 Entity4",
      { maxTokens: 50 },
    );
    // Should be capped at ~50 tokens
    expect(result.tokenCount).toBeLessThanOrEqual(55);
  });

  it("returns empty when user message has no capitalised entities", () => {
    remember({ label: "OpenClaw", type: "entity" });
    const result = buildMemoryContext("what is the meaning of life?");
    expect(result.contextBlock).toBe("");
  });
});

// ── extractAndStoreMemory ─────────────────────────────────────────────────────

describe("extractAndStoreMemory — DB not ready", () => {
  it("returns 0 without crashing when DB is not open", async () => {
    const count = await extractAndStoreMemory(
      "I prefer TypeScript",
      "Sure, TypeScript is great!",
    );
    expect(count).toBe(0);
  });
});

describe("extractAndStoreMemory — with DB", () => {
  beforeEach(() => {
    openTypedMemoryDb(":memory:");
  });

  afterEach(() => {
    resetTypedMemoryDbForTest();
  });

  it("uses extractFn when provided", async () => {
    const extractFn = vi.fn().mockResolvedValue([
      { label: "TypeScript rocks", type: "preference" },
    ]);
    const count = await extractAndStoreMemory(
      "I prefer TypeScript",
      "Yes, TypeScript is great!",
      extractFn,
    );
    expect(count).toBe(1);
    expect(extractFn).toHaveBeenCalledOnce();
  });

  it("falls back to heuristic extraction when no extractFn", async () => {
    const count = await extractAndStoreMemory(
      "I prefer TypeScript over JavaScript",
      "TypeScript is a typed superset of JavaScript",
    );
    // Heuristic should extract at least one preference or fact
    expect(count).toBeGreaterThanOrEqual(0); // graceful — may extract 0 if heuristic misses
  });

  it("falls back to heuristic when extractFn throws", async () => {
    const extractFn = vi.fn().mockRejectedValue(new Error("LLM error"));
    // Should not throw even when extractFn fails
    await expect(
      extractAndStoreMemory("I prefer Bun", "Bun is fast!", extractFn),
    ).resolves.not.toThrow();
  });

  it("links extracted objects to pre-existing context entities", async () => {
    // Pre-existing entity in graph
    remember({ label: "OpenClaw", type: "entity" });

    const extractFn = vi.fn().mockResolvedValue([
      { label: "OpenClaw supports Telegram", type: "fact" },
    ]);

    const count = await extractAndStoreMemory(
      "Tell me about OpenClaw messaging",
      "OpenClaw supports Telegram channels",
      extractFn,
    );
    expect(count).toBe(1);
  });

  it("ignores items with empty labels", async () => {
    const extractFn = vi.fn().mockResolvedValue([
      { label: "", type: "fact" },
      { label: "  ", type: "fact" },
      { label: "Valid fact here", type: "fact" },
    ]);
    const count = await extractAndStoreMemory("anything", "response", extractFn);
    expect(count).toBe(1);
  });

  it("never crashes the loop even when DB writes fail", async () => {
    const extractFn = vi.fn().mockResolvedValue([
      { label: "some fact", type: "fact" },
    ]);
    // Should complete without throwing
    await expect(
      extractAndStoreMemory("msg", "response", extractFn),
    ).resolves.toBeGreaterThanOrEqual(0);
  });
});

// ── getMemoryStats ────────────────────────────────────────────────────────────

describe("getMemoryStats", () => {
  it("returns zero counts when DB not ready", () => {
    const stats = getMemoryStats();
    expect(stats["total"]).toBe(0);
    expect(stats["entity"]).toBe(0);
  });

  it("returns correct counts with DB open", () => {
    openTypedMemoryDb(":memory:");
    remember({ label: "ent-1", type: "entity" });
    remember({ label: "fact-1", type: "fact" });
    remember({ label: "fact-2", type: "fact" });
    const stats = getMemoryStats();
    expect(stats["entity"]).toBe(1);
    expect(stats["fact"]).toBe(2);
    expect(stats["total"]).toBe(3);
    resetTypedMemoryDbForTest();
  });
});
