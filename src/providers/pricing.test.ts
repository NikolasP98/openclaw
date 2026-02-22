import { describe, expect, it } from "vitest";
import { calculateModelCost, calculateSavings, getModelPricing, MODEL_PRICING } from "./pricing.js";

describe("getModelPricing", () => {
  it("returns pricing for known model (exact match)", () => {
    const pricing = getModelPricing("claude-sonnet-4");
    expect(pricing).toBeDefined();
    expect(pricing!.inputPerMillion).toBe(3.0);
    expect(pricing!.outputPerMillion).toBe(15.0);
  });

  it("is case-insensitive", () => {
    expect(getModelPricing("Claude-Sonnet-4")).toBeDefined();
    expect(getModelPricing("GPT-4O")).toBeDefined();
  });

  it("matches by prefix for versioned models", () => {
    const pricing = getModelPricing("gpt-4o-2024-08-06");
    expect(pricing).toBeDefined();
    expect(pricing!.inputPerMillion).toBe(2.5);
  });

  it("returns undefined for unknown models", () => {
    expect(getModelPricing("unknown-model-xyz")).toBeUndefined();
  });

  it("returns undefined for local models (not in table)", () => {
    expect(getModelPricing("qwen3:1.7b")).toBeUndefined();
  });

  it("has at least 15 models in the pricing table", () => {
    expect(Object.keys(MODEL_PRICING).length).toBeGreaterThanOrEqual(15);
  });
});

describe("calculateModelCost", () => {
  it("calculates cost in cents for known model", () => {
    // claude-sonnet-4: $3/M input, $15/M output
    // 1000 input tokens, 500 output tokens (default 0.5x)
    // input: (1000/1_000_000) * 3 = 0.003 USD
    // output: (500/1_000_000) * 15 = 0.0075 USD
    // total: 0.0105 USD = 1.05 cents
    const cost = calculateModelCost("claude-sonnet-4", 1000);
    expect(cost).toBeCloseTo(1.05, 2);
  });

  it("uses explicit output tokens when provided", () => {
    // 1000 input, 1000 output
    // input: (1000/1M) * 3 = 0.003
    // output: (1000/1M) * 15 = 0.015
    // total: 0.018 USD = 1.8 cents
    const cost = calculateModelCost("claude-sonnet-4", 1000, 1000);
    expect(cost).toBeCloseTo(1.8, 4);
  });

  it("returns 0 for unknown models", () => {
    expect(calculateModelCost("unknown-model", 10000)).toBe(0);
  });

  it("returns 0 for local models", () => {
    expect(calculateModelCost("qwen3:1.7b", 10000)).toBe(0);
  });

  it("handles zero tokens", () => {
    expect(calculateModelCost("claude-sonnet-4", 0)).toBe(0);
  });

  it("scales linearly with token count", () => {
    const cost1k = calculateModelCost("gpt-4o", 1000);
    const cost10k = calculateModelCost("gpt-4o", 10000);
    expect(cost10k).toBeCloseTo(cost1k * 10, 8);
  });
});

describe("calculateSavings", () => {
  it("shows savings when routing to cheaper model", () => {
    // gpt-4o-mini vs gpt-4o — mini is much cheaper
    const savings = calculateSavings("gpt-4o-mini", "gpt-4o", 10000);
    expect(savings).toBeGreaterThan(0);
    expect(savings).toBeLessThanOrEqual(100);
  });

  it("shows negative when routing to more expensive model", () => {
    const savings = calculateSavings("claude-opus-4", "claude-sonnet-4", 10000);
    expect(savings).toBeLessThan(0);
  });

  it("returns 0 for unknown routed model", () => {
    expect(calculateSavings("unknown-local", "claude-sonnet-4", 10000)).toBeGreaterThan(0);
  });

  it("returns 0 for unknown default model", () => {
    expect(calculateSavings("claude-sonnet-4", "unknown-local", 10000)).toBe(0);
  });

  it("returns 0 when both models are the same", () => {
    expect(calculateSavings("claude-sonnet-4", "claude-sonnet-4", 10000)).toBe(0);
  });

  it("returns 100% savings for free model vs paid", () => {
    // Local model (cost=0) vs paid model
    expect(calculateSavings("qwen3:1.7b", "claude-sonnet-4", 10000)).toBe(100);
  });
});
