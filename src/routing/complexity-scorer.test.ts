import { describe, expect, it } from "vitest";
import { scoreComplexity } from "./complexity-scorer.js";

describe("scoreComplexity — tier boundaries", () => {
  it("scores simple greeting as Nano tier (< 0.20)", () => {
    const result = scoreComplexity({ message: "Hey thanks" });
    expect(result.score).toBeLessThan(0.2);
    expect(result.tier).toBe("nano");
    expect(result.taskType).toBe("chat");
  });

  it("scores short factual question as Nano or Micro", () => {
    const result = scoreComplexity({ message: "What time is it?" });
    expect(result.score).toBeLessThan(0.5);
    expect(["nano", "micro"]).toContain(result.tier);
  });

  it("scores multi-step code review as Expert tier (> 0.85)", () => {
    const result = scoreComplexity({
      message:
        "Please do a comprehensive code review of this authentication service. " +
        "Analyse the security implications, compare it to best practices, and explain " +
        "why each design decision was made. ```typescript\nconst auth = () => {};\n```",
      recentToolCalls: 4,
      hasCodeBlocks: true,
    });
    expect(result.score).toBeGreaterThan(0.85);
    expect(result.tier).toBe("expert");
  });

  it("scores typical coding task as Base tier (0.50–0.85)", () => {
    const result = scoreComplexity({
      message: "Implement a debounce function in TypeScript.",
      taskType: "code",
    });
    expect(result.score).toBeGreaterThanOrEqual(0.5);
    expect(result.score).toBeLessThanOrEqual(0.85);
    expect(result.tier).toBe("base");
  });

  it("scores research task as Micro or Base", () => {
    const result = scoreComplexity({
      message: "What is the difference between OAuth2 and OpenID Connect?",
    });
    expect(["micro", "base"]).toContain(result.tier);
  });
});

describe("scoreComplexity — inputs affect score monotonically", () => {
  it("longer messages score higher than short ones (same type)", () => {
    const short = scoreComplexity({ message: "hi" });
    const long = scoreComplexity({ message: "a ".repeat(500) });
    expect(long.score).toBeGreaterThan(short.score);
  });

  it("more recent tool calls increase score", () => {
    const few = scoreComplexity({ message: "help me debug this", recentToolCalls: 0 });
    const many = scoreComplexity({ message: "help me debug this", recentToolCalls: 5 });
    expect(many.score).toBeGreaterThan(few.score);
  });

  it("code blocks presence increases score", () => {
    const noBlocks = scoreComplexity({ message: "refactor this code", hasCodeBlocks: false });
    const withBlocks = scoreComplexity({ message: "refactor this code", hasCodeBlocks: true });
    expect(withBlocks.score).toBeGreaterThan(noBlocks.score);
  });

  it("explicit taskType override respected", () => {
    const asChat = scoreComplexity({ message: "tell me about auth", taskType: "chat" });
    const asReasoning = scoreComplexity({ message: "tell me about auth", taskType: "reasoning" });
    expect(asReasoning.score).toBeGreaterThan(asChat.score);
  });
});

describe("scoreComplexity — task type inference", () => {
  it("infers 'reasoning' for explain/compare/why messages", () => {
    expect(scoreComplexity({ message: "Why does this algorithm work?" }).taskType).toBe(
      "reasoning",
    );
    expect(scoreComplexity({ message: "Compare Redis and Memcached." }).taskType).toBe("reasoning");
    expect(scoreComplexity({ message: "Explain the CAP theorem." }).taskType).toBe("reasoning");
  });

  it("infers 'code' for implement/refactor messages", () => {
    expect(scoreComplexity({ message: "Implement a binary search tree." }).taskType).toBe("code");
    expect(scoreComplexity({ message: "Refactor this to use async/await." }).taskType).toBe("code");
  });

  it("infers 'research' for summarize/what is messages", () => {
    expect(scoreComplexity({ message: "What is Kubernetes?" }).taskType).toBe("research");
    expect(scoreComplexity({ message: "Summarize the GDPR requirements." }).taskType).toBe(
      "research",
    );
  });

  it("falls back to 'chat' for casual messages", () => {
    expect(scoreComplexity({ message: "lol ok" }).taskType).toBe("chat");
    expect(scoreComplexity({ message: "sounds good" }).taskType).toBe("chat");
  });
});

describe("scoreComplexity — pure function properties", () => {
  it("is deterministic — same input produces same output", () => {
    const input = { message: "Explain JWT tokens", recentToolCalls: 2 };
    const r1 = scoreComplexity(input);
    const r2 = scoreComplexity(input);
    expect(r1).toEqual(r2);
  });

  it("score is always in [0, 1]", () => {
    const inputs = [
      { message: "" },
      { message: "x".repeat(10000), recentToolCalls: 100, hasCodeBlocks: true },
      { message: "hi" },
    ];
    for (const input of inputs) {
      const { score } = scoreComplexity(input);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it("handles empty message without throwing", () => {
    expect(() => scoreComplexity({ message: "" })).not.toThrow();
  });

  it("handles undefined optional fields gracefully", () => {
    expect(() => scoreComplexity({ message: "test" })).not.toThrow();
  });
});
