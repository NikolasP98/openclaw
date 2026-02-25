import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  importChatGptHistory,
  parseChatGptExport,
} from "./import-chatgpt.js";
import { openTypedMemoryDb, resetTypedMemoryDbForTest } from "../memory/typed-schema.js";
import { listByType } from "../memory/knowledge-graph.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeConversation(overrides: {
  id?: string;
  title?: string;
  userMessages?: string[];
} = {}) {
  const id = overrides.id ?? "conv-001";
  const title = overrides.title ?? "Test Conversation";
  const userMessages = overrides.userMessages ?? ["Hello, how are you?"];

  const mapping: Record<string, { id: string; message: { id: string; author: { role: string }; content: { content_type: string; parts: string[] }; create_time: number | null } | null }> = {};

  for (let i = 0; i < userMessages.length; i++) {
    const msgId = `msg-user-${i}`;
    mapping[msgId] = {
      id: msgId,
      message: {
        id: msgId,
        author: { role: "user" },
        content: { content_type: "text", parts: [userMessages[i]] },
        create_time: 1700000000 + i,
      },
    };
  }

  // Add an assistant reply
  mapping["msg-assistant"] = {
    id: "msg-assistant",
    message: {
      id: "msg-assistant",
      author: { role: "assistant" },
      content: { content_type: "text", parts: ["Sure, I can help!"] },
      create_time: 1700000010,
    },
  };

  return {
    id,
    title,
    create_time: 1700000000,
    mapping,
  };
}

// ── parseChatGptExport ───────────────────────────────────────────────────────

describe("parseChatGptExport", () => {
  it("accepts a direct array of conversations", () => {
    const conv = makeConversation();
    const result = parseChatGptExport([conv]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("conv-001");
  });

  it("accepts an object with conversations property", () => {
    const conv = makeConversation();
    const result = parseChatGptExport({ conversations: [conv] });
    expect(result).toHaveLength(1);
  });

  it("throws on invalid format", () => {
    expect(() => parseChatGptExport({ invalid: "format" })).toThrow();
    expect(() => parseChatGptExport(null)).toThrow();
    expect(() => parseChatGptExport("string")).toThrow();
  });
});

// ── importChatGptHistory ─────────────────────────────────────────────────────

describe("importChatGptHistory — dry-run", () => {
  it("returns counts without writing to DB", async () => {
    const conv = makeConversation({ userMessages: ["I prefer TypeScript over JavaScript"] });
    const result = await importChatGptHistory([conv], { dryRun: true });
    expect(result.conversations).toBe(1);
    expect(result.interactions).toBe(1);
    // No DB writes happened
  });

  it("does not require DB to be open in dry-run mode", async () => {
    const conv = makeConversation();
    // DB not opened — should still work
    const result = await importChatGptHistory([conv], { dryRun: true });
    expect(result.conversations).toBe(1);
  });
});

describe("importChatGptHistory — live import", () => {
  beforeEach(() => {
    openTypedMemoryDb(":memory:");
  });

  afterEach(() => {
    resetTypedMemoryDbForTest();
  });

  it("creates one interaction per conversation", async () => {
    const convs = [makeConversation({ id: "c1" }), makeConversation({ id: "c2" })];
    const result = await importChatGptHistory(convs);
    expect(result.interactions).toBe(2);
    expect(listByType("interaction")).toHaveLength(2);
  });

  it("extracts preferences from user messages", async () => {
    const conv = makeConversation({
      userMessages: ["I prefer TypeScript for all new projects. I always use bun as my package manager."],
    });
    const result = await importChatGptHistory([conv]);
    expect(result.preferences).toBeGreaterThan(0);
    expect(listByType("preference").length).toBeGreaterThan(0);
  });

  it("extracts entities (capitalised names) from user messages", async () => {
    const conv = makeConversation({
      userMessages: ["I use GitHub Actions and Docker Compose for CI/CD in my OpenClaw project."],
    });
    const result = await importChatGptHistory([conv]);
    expect(result.entities).toBeGreaterThan(0);
  });

  it("extracts facts from technical messages", async () => {
    const conv = makeConversation({
      userMessages: [
        "The config is: NODE_ENV=production\nDATABASE_URL=postgres://localhost/mydb\nPORT=3000\nThe server listens on port 3000",
      ],
    });
    const result = await importChatGptHistory([conv]);
    expect(result.facts).toBeGreaterThan(0);
  });

  it("skips duplicate entities on second import", async () => {
    const conv = makeConversation({
      userMessages: ["I use GitHub Actions and TypeScript."],
    });
    const result1 = await importChatGptHistory([conv]);
    const result2 = await importChatGptHistory([conv]);
    expect(result2.skippedDuplicates).toBeGreaterThan(0);
    expect(result2.entities).toBeLessThan(result1.entities + 1);
  });

  it("tags all imported objects with source: chatgpt-import", async () => {
    const conv = makeConversation({
      userMessages: ["I prefer TypeScript."],
    });
    await importChatGptHistory([conv]);
    const interactions = listByType("interaction");
    expect(interactions.every((o) => o.data["source"] === "chatgpt-import")).toBe(true);
  });

  it("respects maxConversations limit", async () => {
    const convs = [
      makeConversation({ id: "c1", title: "First" }),
      makeConversation({ id: "c2", title: "Second" }),
      makeConversation({ id: "c3", title: "Third" }),
    ];
    const result = await importChatGptHistory(convs, { maxConversations: 2 });
    expect(result.conversations).toBe(2);
    expect(result.interactions).toBe(2);
  });

  it("skips conversations with no parseable messages", async () => {
    const emptyConv = {
      id: "empty-conv",
      title: "Empty",
      create_time: 1700000000,
      mapping: {},
    };
    const result = await importChatGptHistory([emptyConv]);
    expect(result.interactions).toBe(0);
  });

  it("uses conversation id fragment as fallback title", async () => {
    const conv = { ...makeConversation(), title: "" };
    const result = await importChatGptHistory([conv]);
    expect(result.interactions).toBe(1);
    const interactions = listByType("interaction");
    expect(interactions[0].label).toContain("ChatGPT conversation");
  });
});
