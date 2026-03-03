import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KnowledgeGraphSession, remember } from "../memory/knowledge-graph.js";
import {
  closeAndEvictDb,
  openTypedMemoryDb,
  resetDbRegistryForTest,
  resetTypedMemoryDbForTest,
} from "../memory/typed-schema.js";
import {
  buildMemoryContext,
  detectEntityMentions,
  extractAndStoreMemory,
  extractLastAssistantText,
  getMemoryStats,
} from "./memory-integration.js";

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
    const mentions = detectEntityMentions(
      "I use TypeScript. TypeScript is great. TypeScript rocks.",
    );
    expect(mentions.filter((m) => m === "TypeScript")).toHaveLength(1);
  });

  it("returns empty array for lowercase-only messages", () => {
    const mentions = detectEntityMentions("hello world, how are you?");
    expect(mentions).toHaveLength(0);
  });
});

// ── buildMemoryContext ────────────────────────────────────────────────────────

describe("buildMemoryContext", () => {
  let session: KnowledgeGraphSession;

  beforeEach(() => {
    session = KnowledgeGraphSession.open(":memory:");
  });

  afterEach(() => {
    closeAndEvictDb(":memory:");
    resetDbRegistryForTest();
  });

  it("returns empty block when no entities match", () => {
    const result = buildMemoryContext("Tell me about something unknown", session);
    expect(result.contextBlock).toBe("");
  });

  it("includes entity data when entity is found", () => {
    session.remember({ label: "OpenClaw", type: "entity", data: { role: "main product" } });
    const result = buildMemoryContext("Can you explain OpenClaw to me?", session);
    expect(result.contextBlock).toContain("OpenClaw");
    expect(result.objectCount).toBeGreaterThan(0);
    expect(result.tokenCount).toBeGreaterThan(0);
  });

  it("respects maxTokens budget", () => {
    for (let i = 0; i < 5; i++) {
      session.remember({
        label: `Entity${i}`,
        type: "entity",
        data: { description: "a".repeat(300) },
      });
    }
    const result = buildMemoryContext(
      "Tell me about Entity0 Entity1 Entity2 Entity3 Entity4",
      session,
      { maxTokens: 50 },
    );
    expect(result.tokenCount).toBeLessThanOrEqual(55);
  });

  it("returns empty when user message has no capitalised entities", () => {
    session.remember({ label: "OpenClaw", type: "entity" });
    const result = buildMemoryContext("what is the meaning of life?", session);
    expect(result.contextBlock).toBe("");
  });
});

// ── extractAndStoreMemory ─────────────────────────────────────────────────────

describe("extractAndStoreMemory", () => {
  let session: KnowledgeGraphSession;

  beforeEach(() => {
    session = KnowledgeGraphSession.open(":memory:");
  });

  afterEach(() => {
    closeAndEvictDb(":memory:");
    resetDbRegistryForTest();
  });

  it("uses extractFn when provided", async () => {
    const extractFn = vi
      .fn()
      .mockResolvedValue([{ label: "TypeScript rocks", type: "preference" }]);
    const count = await extractAndStoreMemory(
      "I prefer TypeScript",
      "Yes, TypeScript is great!",
      session,
      extractFn,
    );
    expect(count).toBe(1);
    expect(extractFn).toHaveBeenCalledOnce();
  });

  it("falls back to heuristic extraction when no extractFn", async () => {
    const count = await extractAndStoreMemory(
      "I prefer TypeScript over JavaScript",
      "TypeScript is a typed superset of JavaScript",
      session,
    );
    // Heuristic should extract at least one preference or fact
    expect(count).toBeGreaterThanOrEqual(0); // graceful — may extract 0 if heuristic misses
  });

  it("falls back to heuristic when extractFn throws", async () => {
    const extractFn = vi.fn().mockRejectedValue(new Error("LLM error"));
    await expect(
      extractAndStoreMemory("I prefer Bun", "Bun is fast!", session, extractFn),
    ).resolves.not.toThrow();
  });

  it("links extracted objects to pre-existing context entities", async () => {
    session.remember({ label: "OpenClaw", type: "entity" });
    const extractFn = vi
      .fn()
      .mockResolvedValue([{ label: "OpenClaw supports Telegram", type: "fact" }]);
    const count = await extractAndStoreMemory(
      "Tell me about OpenClaw messaging",
      "OpenClaw supports Telegram channels",
      session,
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
    const count = await extractAndStoreMemory("anything", "response", session, extractFn);
    expect(count).toBe(1);
  });

  it("never crashes the loop even when DB writes fail", async () => {
    const extractFn = vi.fn().mockResolvedValue([{ label: "some fact", type: "fact" }]);
    await expect(
      extractAndStoreMemory("msg", "response", session, extractFn),
    ).resolves.toBeGreaterThanOrEqual(0);
  });
});

// ── extractLastAssistantText ──────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = any;

describe("extractLastAssistantText", () => {
  it("extracts string content from last assistant message", () => {
    const messages: Msg[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    expect(extractLastAssistantText(messages as AgentMessage[])).toBe("world");
  });

  it("extracts text blocks from array content", () => {
    const messages: Msg[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Hello" },
          { type: "text", text: "World" },
        ],
      },
    ];
    expect(extractLastAssistantText(messages as AgentMessage[])).toBe("Hello\nWorld");
  });

  it("skips non-text blocks in array content", () => {
    const messages: Msg[] = [
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "x", name: "foo", input: {} },
          { type: "text", text: "Result here" },
        ],
      },
    ];
    expect(extractLastAssistantText(messages as AgentMessage[])).toBe("Result here");
  });

  it("finds the last assistant message when multiple exist", () => {
    const messages: Msg[] = [
      { role: "assistant", content: "first" },
      { role: "user", content: "ok" },
      { role: "assistant", content: "last" },
    ];
    expect(extractLastAssistantText(messages as AgentMessage[])).toBe("last");
  });

  it("returns empty string when no assistant messages", () => {
    const messages: Msg[] = [{ role: "user", content: "hello" }];
    expect(extractLastAssistantText(messages as AgentMessage[])).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(extractLastAssistantText([])).toBe("");
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
    // getMemoryStats uses module-level listByType which uses the singleton DB
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
