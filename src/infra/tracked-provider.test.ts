import { describe, expect, it } from "vitest";
import { estimateCostCents, SessionCostLedger } from "./tracked-provider.js";

describe("tracked-provider", () => {
  describe("estimateCostCents", () => {
    it("estimates Anthropic Claude Sonnet cost", () => {
      const cost = estimateCostCents("claude-sonnet-4", { inputTokens: 1000, outputTokens: 500 });
      // 1K input @ $0.003/K = 0.3c, 0.5K output @ $0.015/K = 0.75c
      expect(cost).toBeCloseTo(0.3 + 0.75, 1);
    });

    it("estimates OpenAI GPT-4o cost", () => {
      const cost = estimateCostCents("gpt-4o", { inputTokens: 2000, outputTokens: 1000 });
      // 2K input @ $0.0025/K = 0.5c, 1K output @ $0.01/K = 1.0c
      expect(cost).toBeCloseTo(0.5 + 1.0, 1);
    });

    it("returns 0 for ollama (local) models", () => {
      expect(estimateCostCents("ollama", { inputTokens: 50000, outputTokens: 10000 })).toBe(0);
    });

    it("returns 0 for unknown models", () => {
      expect(estimateCostCents("unknown-model-xyz", { inputTokens: 1000, outputTokens: 500 })).toBe(0);
    });

    it("matches model by substring", () => {
      // "claude-sonnet-4" is in the pricing table, "anthropic/claude-sonnet-4" should match
      const cost = estimateCostCents("anthropic/claude-sonnet-4", { inputTokens: 1000, outputTokens: 500 });
      expect(cost).toBeGreaterThan(0);
    });

    it("accounts for cache read tokens at 10% rate", () => {
      const withCache = estimateCostCents("claude-sonnet-4", {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 5000,
      });
      const withoutCache = estimateCostCents("claude-sonnet-4", {
        inputTokens: 1000,
        outputTokens: 500,
      });
      // Cache reads should add a small amount.
      expect(withCache).toBeGreaterThan(withoutCache);
      // But 90% cheaper than regular input.
      const fullPriceExtra = estimateCostCents("claude-sonnet-4", {
        inputTokens: 6000,
        outputTokens: 500,
      });
      expect(withCache).toBeLessThan(fullPriceExtra);
    });
  });

  describe("SessionCostLedger", () => {
    it("records calls and accumulates totals", () => {
      const ledger = new SessionCostLedger("session-1");
      ledger.record({
        provider: "anthropic",
        model: "claude-sonnet-4",
        usage: { inputTokens: 1000, outputTokens: 500 },
        latencyMs: 800,
      });
      ledger.record({
        provider: "anthropic",
        model: "claude-sonnet-4",
        usage: { inputTokens: 2000, outputTokens: 1000 },
        latencyMs: 1200,
      });

      const totals = ledger.totals();
      expect(totals.totalCalls).toBe(2);
      expect(totals.totalInputTokens).toBe(3000);
      expect(totals.totalOutputTokens).toBe(1500);
      expect(totals.totalCostCents).toBeGreaterThan(0);
    });

    it("allows cost override", () => {
      const ledger = new SessionCostLedger("session-2");
      const call = ledger.record({
        provider: "anthropic",
        model: "claude-sonnet-4",
        usage: { inputTokens: 1000, outputTokens: 500 },
        latencyMs: 500,
        costCentsOverride: 99.99,
      });
      expect(call.costCents).toBe(99.99);
      expect(ledger.totals().totalCostCents).toBe(99.99);
    });

    it("returns call history", () => {
      const ledger = new SessionCostLedger("session-3");
      ledger.record({ provider: "openai", model: "gpt-4o", usage: { inputTokens: 100, outputTokens: 50 }, latencyMs: 300 });
      ledger.record({ provider: "openai", model: "gpt-4o", usage: { inputTokens: 200, outputTokens: 100 }, latencyMs: 400 });

      expect(ledger.history()).toHaveLength(2);
      expect(ledger.recentCalls(1)).toHaveLength(1);
      expect(ledger.recentCalls(1)[0]!.usage.inputTokens).toBe(200);
    });

    it("handles local models with zero cost", () => {
      const ledger = new SessionCostLedger("session-4");
      ledger.record({
        provider: "ollama",
        model: "ollama",
        usage: { inputTokens: 50000, outputTokens: 10000 },
        latencyMs: 2000,
      });
      expect(ledger.totals().totalCostCents).toBe(0);
      expect(ledger.totals().totalInputTokens).toBe(50000);
    });
  });
});
