import { describe, expect, it } from "vitest";
import { resolveRelevanceGate } from "./relevance-gate.js";

describe("resolveRelevanceGate", () => {
  it("always responds when explicitly mentioned", () => {
    const result = resolveRelevanceGate({
      text: "hello everyone",
      keywords: [],
      isFromBot: false,
      wasMentioned: true,
    });
    expect(result.shouldRespond).toBe(true);
    expect(result.reason).toBe("mentioned");
  });

  it("always responds when mentioned, even from a bot", () => {
    const result = resolveRelevanceGate({
      text: "hello @chef_bot",
      keywords: ["cooking"],
      isFromBot: true,
      wasMentioned: true,
    });
    expect(result.shouldRespond).toBe(true);
    expect(result.reason).toBe("mentioned");
  });

  it("skips bot messages that are not mentions (anti-loop)", () => {
    const result = resolveRelevanceGate({
      text: "I can help with cooking pasta",
      keywords: ["cooking", "pasta"],
      isFromBot: true,
      wasMentioned: false,
    });
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toBe("bot-no-mention");
  });

  it("responds when a keyword matches in human message", () => {
    const result = resolveRelevanceGate({
      text: "what's the best recipe for pasta?",
      keywords: ["cooking", "pasta", "recipe"],
      isFromBot: false,
      wasMentioned: false,
    });
    expect(result.shouldRespond).toBe(true);
    expect(result.reason).toBe("keyword-match");
  });

  it("skips when no keywords match", () => {
    const result = resolveRelevanceGate({
      text: "let's talk about the weather today",
      keywords: ["cooking", "pasta", "recipe"],
      isFromBot: false,
      wasMentioned: false,
    });
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toBe("no-match");
  });

  it("skips when keywords list is empty", () => {
    const result = resolveRelevanceGate({
      text: "hello everyone",
      keywords: [],
      isFromBot: false,
      wasMentioned: false,
    });
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toBe("no-match");
  });

  it("skips when text is empty", () => {
    const result = resolveRelevanceGate({
      text: "",
      keywords: ["cooking"],
      isFromBot: false,
      wasMentioned: false,
    });
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toBe("no-match");
  });

  it("matches keywords case-insensitively", () => {
    const result = resolveRelevanceGate({
      text: "I love COOKING Italian food",
      keywords: ["cooking"],
      isFromBot: false,
      wasMentioned: false,
    });
    expect(result.shouldRespond).toBe(true);
    expect(result.reason).toBe("keyword-match");
  });

  it("uses word boundaries to avoid partial matches", () => {
    const result = resolveRelevanceGate({
      text: "I went overcooking things again",
      keywords: ["cooking"],
      isFromBot: false,
      wasMentioned: false,
    });
    // "overcooking" should NOT match "cooking" at word boundary
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toBe("no-match");
  });

  it("matches multi-word keywords", () => {
    const result = resolveRelevanceGate({
      text: "we need help with project management this week",
      keywords: ["project management", "budgeting"],
      isFromBot: false,
      wasMentioned: false,
    });
    expect(result.shouldRespond).toBe(true);
    expect(result.reason).toBe("keyword-match");
  });

  it("skips blank keywords", () => {
    const result = resolveRelevanceGate({
      text: "hello world",
      keywords: ["", "  "],
      isFromBot: false,
      wasMentioned: false,
    });
    expect(result.shouldRespond).toBe(false);
    expect(result.reason).toBe("no-match");
  });

  it("handles regex special characters in keywords safely", () => {
    // Keywords with regex metacharacters should not throw and should not cause false positives
    const result = resolveRelevanceGate({
      text: "let's discuss the new C++ framework",
      keywords: ["c++"],
      isFromBot: false,
      wasMentioned: false,
    });
    // "c++" contains regex metacharacters but should be escaped and still match
    expect(result.shouldRespond).toBe(true);
    expect(result.reason).toBe("keyword-match");
  });
});
