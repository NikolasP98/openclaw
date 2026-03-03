/**
 * Per-model pricing table — cost estimation for routing decisions.
 *
 * Tracks input/output token prices per million tokens for popular models.
 * Used by the smart routing system to estimate cost and calculate savings
 * vs the default API model.
 *
 * Prices in USD per million tokens.
 * Sources: official pricing pages (Mar 2026) + ClawRouter v0.10.0 audit.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type ModelPricing = {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
};

// ── Pricing Data ─────────────────────────────────────────────────────────────

/**
 * Known model prices. Key format: lowercase model id (without provider prefix).
 * For Ollama/local models, cost is 0 (electricity only, not tracked).
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-sonnet-4": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-opus-4": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  "claude-haiku-3.5": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  "claude-3.5-sonnet": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-3-opus": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  "claude-3-haiku": { inputPerMillion: 0.25, outputPerMillion: 1.25 },

  // OpenAI
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10.0 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4-turbo": { inputPerMillion: 10.0, outputPerMillion: 30.0 },
  "gpt-4": { inputPerMillion: 30.0, outputPerMillion: 60.0 },
  "gpt-5.2": { inputPerMillion: 10.0, outputPerMillion: 30.0 }, // ClawRouter v0.10.0
  o1: { inputPerMillion: 15.0, outputPerMillion: 60.0 },
  "o1-mini": { inputPerMillion: 3.0, outputPerMillion: 12.0 },
  o3: { inputPerMillion: 10.0, outputPerMillion: 40.0 },
  "o3-mini": { inputPerMillion: 1.1, outputPerMillion: 4.4 },
  "o4-mini": { inputPerMillion: 1.1, outputPerMillion: 4.4 },

  // Google
  "gemini-3.1-pro": { inputPerMillion: 2.5, outputPerMillion: 15.0 }, // ClawRouter v0.10.0 (preview)
  "gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  "gemini-2.5-flash-lite": { inputPerMillion: 0.05, outputPerMillion: 0.2 }, // ClawRouter v0.10.0 (ECO tier)
  "gemini-2.5-flash": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  "gemini-1.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5.0 },
  "gemini-1.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },

  // Groq
  "mixtral-8x7b": { inputPerMillion: 0.24, outputPerMillion: 0.24 },

  // Mistral
  "mistral-large": { inputPerMillion: 2.0, outputPerMillion: 6.0 },
  codestral: { inputPerMillion: 0.3, outputPerMillion: 0.9 },
  "pixtral-large": { inputPerMillion: 2.0, outputPerMillion: 6.0 },

  // DeepSeek
  "deepseek-chat": { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  "deepseek-coder": { inputPerMillion: 0.14, outputPerMillion: 0.28 },
  "deepseek-r1": { inputPerMillion: 0.55, outputPerMillion: 2.19 },

  // xAI
  "grok-2": { inputPerMillion: 2.0, outputPerMillion: 10.0 },
  "grok-3": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
};

// ── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Look up pricing for a model. Tries exact match, then prefix match.
 * Returns undefined for unknown or local models (cost = 0).
 */
export function getModelPricing(modelId: string): ModelPricing | undefined {
  const lower = modelId.toLowerCase();

  const exact = MODEL_PRICING[lower];
  if (exact) {
    return exact;
  }

  for (const [key, value] of Object.entries(MODEL_PRICING)) {
    if (lower.startsWith(key)) {
      return value;
    }
  }

  return undefined;
}

// ── Cost Calculation ─────────────────────────────────────────────────────────

/**
 * Estimate cost in cents for a model invocation.
 *
 * Returns 0 for unknown/local models (no pricing data).
 *
 * @param modelId - Model identifier (without provider prefix)
 * @param inputTokens - Estimated input token count
 * @param outputTokens - Estimated output token count (default: inputTokens * 0.5)
 */
export function calculateModelCost(
  modelId: string,
  inputTokens: number,
  outputTokens?: number,
): number {
  const pricing = getModelPricing(modelId);
  if (!pricing) {
    return 0;
  }
  const outTokens = outputTokens ?? Math.round(inputTokens * 0.5);
  const inputCostUsd = (inputTokens / 1_000_000) * pricing.inputPerMillion;
  const outputCostUsd = (outTokens / 1_000_000) * pricing.outputPerMillion;
  return (inputCostUsd + outputCostUsd) * 100; // Convert to cents
}

/**
 * Calculate percentage savings of using a routed model vs the default model.
 *
 * Returns 0 if either model is unknown or both have the same cost.
 * Returns a positive number (0-100) for savings, negative for overspend.
 *
 * @param routedModel - The model actually used (from routing)
 * @param defaultModel - The default API model that would have been used
 * @param inputTokens - Estimated input token count
 */
export function calculateSavings(
  routedModel: string,
  defaultModel: string,
  inputTokens: number,
): number {
  const routedCost = calculateModelCost(routedModel, inputTokens);
  const defaultCost = calculateModelCost(defaultModel, inputTokens);

  if (defaultCost === 0) {
    return 0;
  }

  return Math.round(((defaultCost - routedCost) / defaultCost) * 100);
}
