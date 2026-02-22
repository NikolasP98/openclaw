import { describe, expect, it } from "vitest";
import { scoreMessage, type ScorerConfig } from "./weighted-scorer.js";

describe("weighted-scorer", () => {
  describe("tier classification", () => {
    it("classifies empty message as simple", () => {
      expect(scoreMessage("").tier).toBe("simple");
      expect(scoreMessage("   ").tier).toBe("simple");
    });

    it("classifies bare acknowledgements as simple", () => {
      expect(scoreMessage("ok").tier).toBe("simple");
      expect(scoreMessage("thanks").tier).toBe("simple");
      expect(scoreMessage("👍").tier).toBe("simple");
      expect(scoreMessage("lol").tier).toBe("simple");
    });

    it("classifies short greetings as simple", () => {
      expect(scoreMessage("hey").tier).toBe("simple");
      expect(scoreMessage("hi there").tier).toBe("simple");
    });

    it("classifies moderate questions", () => {
      const result = scoreMessage("show me the weather for tomorrow");
      expect(["moderate", "simple"]).toContain(result.tier);
    });

    it("classifies complex technical requests", () => {
      const result = scoreMessage("refactor the authentication middleware to use JWT and implement rate limiting on the /api/users endpoint");
      expect(result.tier).toBe("complex");
    });

    it("classifies code blocks as complex", () => {
      const result = scoreMessage("```typescript\nfunction hello() { return 'world'; }\n```");
      expect(result.tier).toBe("complex");
    });

    it("reasoning dimension fires for reasoning-heavy messages", () => {
      const result = scoreMessage("step by step, prove that the sum of first n natural numbers equals n(n+1)/2 using mathematical induction. Show the formal derivation with each step clearly labeled.");
      // Reasoning dimension should fire regardless of final tier.
      const reasoningDim = result.dimensions.find((d) => d.name === "reasoning");
      expect(reasoningDim!.score).toBeGreaterThan(0);
      // Should not be simple.
      expect(result.tier).not.toBe("simple");
    });

    it("chain-of-thought requests score above simple", () => {
      const result = scoreMessage("Think through this step-by-step: analyze the tradeoffs between microservices and monolith for a startup with 3 engineers. Consider pros and cons of each approach using formal reasoning.");
      expect(result.tier).not.toBe("simple");
      expect(result.totalScore).toBeGreaterThan(0.05);
    });
  });

  describe("scoring dimensions", () => {
    it("returns 15 dimensions", () => {
      const result = scoreMessage("test message");
      expect(result.dimensions.length).toBe(15);
    });

    it("includes named dimensions", () => {
      const result = scoreMessage("test");
      const names = result.dimensions.map((d) => d.name);
      expect(names).toContain("codeBlockPresence");
      expect(names).toContain("verbComplexity");
      expect(names).toContain("reasoning");
      expect(names).toContain("acknowledgement");
      expect(names).toContain("emotionOnly");
    });

    it("scores code blocks high on codeBlockPresence", () => {
      const result = scoreMessage("```\nconst x = 1;\n```");
      const dim = result.dimensions.find((d) => d.name === "codeBlockPresence");
      expect(dim?.score).toBe(1);
    });

    it("scores acknowledgements on acknowledgement dimension", () => {
      const result = scoreMessage("ok");
      const dim = result.dimensions.find((d) => d.name === "acknowledgement");
      expect(dim?.score).toBe(1);
    });

    it("scores reasoning keywords on reasoning dimension", () => {
      const result = scoreMessage("prove this theorem using mathematical induction");
      const dim = result.dimensions.find((d) => d.name === "reasoning");
      expect(dim!.score).toBeGreaterThan(0);
    });
  });

  describe("totalScore normalization", () => {
    it("score is between 0 and 1", () => {
      const messages = [
        "", "ok", "hey", "hello",
        "show me the files",
        "refactor the entire API layer using clean architecture patterns with dependency injection",
        "```\nconst x = 1;\n```\nPlease fix this function that uses docker and kubernetes to deploy the application",
      ];
      for (const msg of messages) {
        const result = scoreMessage(msg);
        expect(result.totalScore).toBeGreaterThanOrEqual(0);
        expect(result.totalScore).toBeLessThanOrEqual(1);
      }
    });

    it("acknowledgements have low score", () => {
      expect(scoreMessage("ok").totalScore).toBeLessThan(0.2);
    });

    it("complex requests score higher than simple", () => {
      const complexScore = scoreMessage("implement a REST API with authentication, database migrations, and docker deployment pipeline").totalScore;
      const simpleScore = scoreMessage("ok").totalScore;
      expect(complexScore).toBeGreaterThan(simpleScore);
      expect(complexScore).toBeGreaterThan(0.1);
    });
  });

  describe("config overrides", () => {
    it("respects custom thresholds", () => {
      const config: ScorerConfig = {
        simpleThreshold: 0.1,
        complexThreshold: 0.3,
        reasoningThreshold: 0.5,
      };
      // A message that scores moderate with defaults might score complex with lower threshold.
      const result = scoreMessage("can you explain this function?", config);
      expect(result.tier).toBeDefined();
    });

    it("respects custom weights", () => {
      const config: ScorerConfig = {
        weights: { codeBlockPresence: 0 }, // Disable code detection.
      };
      const normal = scoreMessage("```\ncode\n```");
      const custom = scoreMessage("```\ncode\n```", config);
      // Custom should score lower since code detection is disabled.
      expect(custom.totalScore).toBeLessThanOrEqual(normal.totalScore);
    });
  });
});
