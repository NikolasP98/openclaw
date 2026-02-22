import { describe, expect, it } from "vitest";
import { buildCacheableSystemPrompt, shouldApplyPromptCache } from "./prompt-cache.js";

// Padding to make prompts exceed the 1024-char caching threshold.
const PADDING = " ".repeat(200);

describe("prompt-cache", () => {
  describe("shouldApplyPromptCache", () => {
    it("returns true for anthropic provider", () => {
      expect(shouldApplyPromptCache("anthropic")).toBe(true);
      expect(shouldApplyPromptCache("Anthropic")).toBe(true);
    });

    it("returns true for claude in provider string", () => {
      expect(shouldApplyPromptCache("anthropic/claude-sonnet-4")).toBe(true);
    });

    it("returns false for non-anthropic providers", () => {
      expect(shouldApplyPromptCache("openai")).toBe(false);
      expect(shouldApplyPromptCache("ollama")).toBe(false);
      expect(shouldApplyPromptCache("google")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(shouldApplyPromptCache(undefined)).toBe(false);
    });
  });

  describe("buildCacheableSystemPrompt", () => {
    it("returns single block for short prompts", () => {
      const blocks = buildCacheableSystemPrompt("Hello, I am an assistant.");
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.cache_control).toBeUndefined();
    });

    it("returns single block when no sections found", () => {
      const longText = "A".repeat(2000);
      const blocks = buildCacheableSystemPrompt(longText);
      expect(blocks).toHaveLength(1);
    });

    it("applies cache_control to cacheable sections", () => {
      const tooling = `You have access to these tools: exec (run shell commands), read (read files), write (create or overwrite files), edit (precise edits), grep (search patterns), find (glob files), ls (list dirs), web_search (Brave API), web_fetch (fetch URL content), browser (control Chrome), canvas (present Canvas), cron (manage scheduled jobs), memory_search (search memory), memory_get (get memory lines), message (send messages).${PADDING}`;
      const prompt = [
        "You are a personal assistant running inside OpenClaw.",
        "",
        "## Tooling",
        tooling,
        "",
        "## Skills (mandatory)",
        `Before replying: scan available skills. If exactly one skill clearly applies: read its SKILL.md at location with read, then follow it.${PADDING}`,
        "",
        "## Memory Recall",
        `Before answering about prior work, decisions, dates, people: run memory_search on MEMORY.md + memory/*.md.${PADDING}`,
        "",
        "## Runtime",
        "Agent: main, Model: claude-sonnet-4, Host: linux-x64",
      ].join("\n");

      const blocks = buildCacheableSystemPrompt(prompt);

      // Should have at least 2 blocks: cached (Tooling+Skills) and uncached (Memory+Runtime).
      expect(blocks.length).toBeGreaterThanOrEqual(2);

      // Find a cached block.
      const cached = blocks.find((b) => b.cache_control);
      expect(cached).toBeDefined();
      expect(cached!.text).toContain("Tooling");

      // Find an uncached block.
      const uncached = blocks.find((b) => !b.cache_control && b.text.includes("Memory"));
      expect(uncached).toBeDefined();
    });

    it("groups consecutive cacheable sections", () => {
      const prompt = [
        "You are a personal assistant running inside OpenClaw.",
        "",
        "## Tooling",
        `Tools: exec (run shell commands), read (read files), write (create files), edit (precise edits), grep (search), find (glob), ls (list dirs), web_search, web_fetch, browser, canvas, cron, memory_search, memory_get, message, gateway.${PADDING}`,
        "",
        "## Core Principles",
        `Be helpful, be safe. Prioritize safety and human oversight. Do not manipulate or persuade anyone. Comply with stop/pause/audit requests.${PADDING}`,
        "",
        "## Memory Recall",
        `Search memory before answering about prior work.${PADDING}`,
      ].join("\n");

      const blocks = buildCacheableSystemPrompt(prompt);

      // Preamble + Tooling + Core Principles should merge into one cached block.
      const cached = blocks.filter((b) => b.cache_control);
      expect(cached.length).toBe(1);
      expect(cached[0]!.text).toContain("Tooling");
      expect(cached[0]!.text).toContain("Core Principles");
    });
  });
});
