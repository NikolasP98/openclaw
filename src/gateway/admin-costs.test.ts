import { describe, expect, it } from "vitest";
import { buildAdminCostResponse } from "./admin-costs.js";
import type { CostUsageSummary } from "../infra/session-cost-usage.types.js";

describe("admin-costs", () => {
  const makeSummary = (overrides?: Partial<CostUsageSummary>): CostUsageSummary => ({
    updatedAt: Date.now(),
    days: 7,
    daily: [
      { date: new Date().toISOString().slice(0, 10), totalCost: 1.5, totalTokens: 5000, input: 3000, output: 2000, cacheRead: 0, cacheWrite: 0, inputCost: 0.9, outputCost: 0.6, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 },
      { date: "2026-02-20", totalCost: 2.0, totalTokens: 8000, input: 5000, output: 3000, cacheRead: 0, cacheWrite: 0, inputCost: 1.2, outputCost: 0.8, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 },
    ],
    totals: { totalCost: 3.5, totalTokens: 13000, input: 8000, output: 5000, cacheRead: 0, cacheWrite: 0, inputCost: 2.1, outputCost: 1.4, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 },
    ...overrides,
  });

  it("builds response with summary, daily, and today", () => {
    const response = buildAdminCostResponse({ summary: makeSummary() });
    expect(response.summary.totalCost).toBe(3.5);
    expect(response.summary.totalTokens).toBe(13000);
    expect(response.daily).toHaveLength(2);
    expect(response.today.cost).toBeGreaterThan(0);
    expect(response.generatedAt).toBeTruthy();
  });

  it("aggregates model usage across days", () => {
    const response = buildAdminCostResponse({
      summary: makeSummary(),
      modelUsage: [
        { date: "2026-02-21", provider: "anthropic", model: "claude-sonnet-4", tokens: 3000, cost: 0.9, count: 5 },
        { date: "2026-02-20", provider: "anthropic", model: "claude-sonnet-4", tokens: 5000, cost: 1.2, count: 8 },
        { date: "2026-02-21", provider: "ollama", model: "gemma3:12b", tokens: 2000, cost: 0, count: 10 },
      ],
    });
    expect(response.byModel).toHaveLength(2);
    const anthropic = response.byModel.find((m) => m.provider === "anthropic");
    expect(anthropic?.totalCost).toBe(2.1);
    expect(anthropic?.callCount).toBe(13);
  });

  it("handles empty summary", () => {
    const response = buildAdminCostResponse({
      summary: { updatedAt: Date.now(), days: 0, daily: [], totals: { totalCost: 0, totalTokens: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, inputCost: 0, outputCost: 0, cacheReadCost: 0, cacheWriteCost: 0, missingCostEntries: 0 } },
    });
    expect(response.summary.totalCost).toBe(0);
    expect(response.today.cost).toBe(0);
    expect(response.byModel).toHaveLength(0);
  });

  it("sorts byModel by cost descending", () => {
    const response = buildAdminCostResponse({
      summary: makeSummary(),
      modelUsage: [
        { date: "2026-02-21", provider: "ollama", model: "small", tokens: 100, cost: 0, count: 50 },
        { date: "2026-02-21", provider: "anthropic", model: "claude", tokens: 3000, cost: 5.0, count: 3 },
      ],
    });
    expect(response.byModel[0]?.provider).toBe("anthropic");
  });
});
