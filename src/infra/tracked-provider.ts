/**
 * TrackedProvider — intercept-at-call-time cost tracking middleware.
 *
 * Wraps an LLM provider call and maintains a per-session running cost
 * ledger that updates at call completion. Cleaner than post-processing
 * session transcripts — cost is available immediately after each turn.
 *
 * Inspired by ClawWork's `provider_wrapper.py` TrackedProvider pattern.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("infra/tracked-provider");

// ── Types ────────────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface TrackedCall {
  timestamp: number;
  provider: string;
  model: string;
  usage: TokenUsage;
  costCents: number;
  latencyMs: number;
}

export interface SessionLedger {
  sessionId: string;
  calls: TrackedCall[];
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  /** Running total of cache-read tokens across all calls in this session. */
  totalCacheReadTokens: number;
  /**
   * Cache hit-rate: ratio of cache-read tokens to total input tokens (0–1).
   * 0 when no calls have been recorded yet.
   */
  cacheHitRate: number;
}

// ── Pricing table (cents per 1K tokens) ──────────────────────────────

/** Per-model pricing: [inputCentsPerKToken, outputCentsPerKToken]. */
const MODEL_PRICING: Record<string, [number, number]> = {
  // Anthropic
  "claude-sonnet-4": [0.3, 1.5],
  "claude-opus-4": [1.5, 7.5],
  "claude-haiku-3.5": [0.08, 0.4],
  // OpenAI
  "gpt-4o": [0.25, 1.0],
  "gpt-4o-mini": [0.015, 0.06],
  o1: [1.5, 6.0],
  "o3-mini": [0.11, 0.44],
  // Google
  "gemini-2.5-pro": [0.125, 0.5],
  "gemini-2.5-flash": [0.015, 0.06],
  // Local models — free
  ollama: [0, 0],
};

/**
 * Estimate cost in cents for a given model and token usage.
 */
export function estimateCostCents(model: string, usage: TokenUsage): number {
  // Try exact match first, then prefix match.
  const pricing =
    MODEL_PRICING[model] ?? Object.entries(MODEL_PRICING).find(([key]) => model.includes(key))?.[1];

  if (!pricing) {
    // Unknown model — assume local/free.
    return 0;
  }

  const [inputRate, outputRate] = pricing;
  const inputCost = (usage.inputTokens / 1000) * inputRate;
  const outputCost = (usage.outputTokens / 1000) * outputRate;
  // Cache reads are typically 90% cheaper.
  const cacheReadCost = ((usage.cacheReadTokens ?? 0) / 1000) * inputRate * 0.1;
  // Cache writes cost same as input.
  const cacheWriteCost = ((usage.cacheWriteTokens ?? 0) / 1000) * inputRate;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}

// ── Session ledger ───────────────────────────────────────────────────

export class SessionCostLedger {
  private ledger: SessionLedger;

  constructor(sessionId: string) {
    this.ledger = {
      sessionId,
      calls: [],
      totalCostCents: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCalls: 0,
      totalCacheReadTokens: 0,
      cacheHitRate: 0,
    };
  }

  /**
   * Record a completed LLM call.
   */
  record(params: {
    provider: string;
    model: string;
    usage: TokenUsage;
    latencyMs: number;
    costCentsOverride?: number;
  }): TrackedCall {
    const costCents = params.costCentsOverride ?? estimateCostCents(params.model, params.usage);

    const call: TrackedCall = {
      timestamp: Date.now(),
      provider: params.provider,
      model: params.model,
      usage: params.usage,
      costCents,
      latencyMs: params.latencyMs,
    };

    this.ledger.calls.push(call);
    this.ledger.totalCostCents += costCents;
    this.ledger.totalInputTokens += params.usage.inputTokens;
    this.ledger.totalOutputTokens += params.usage.outputTokens;
    this.ledger.totalCalls++;
    this.ledger.totalCacheReadTokens += params.usage.cacheReadTokens ?? 0;
    this.ledger.cacheHitRate =
      this.ledger.totalInputTokens > 0
        ? this.ledger.totalCacheReadTokens / this.ledger.totalInputTokens
        : 0;

    log.debug(
      `[${this.ledger.sessionId}] ${params.model}: ${params.usage.inputTokens}→${params.usage.outputTokens} tokens, $${(costCents / 100).toFixed(4)}, ${params.latencyMs}ms`,
    );

    return call;
  }

  /** Get the running totals. */
  totals(): Omit<SessionLedger, "calls"> {
    const { calls: _, ...totals } = this.ledger;
    return totals;
  }

  /** Get full call history. */
  history(): TrackedCall[] {
    return [...this.ledger.calls];
  }

  /** Get the last N calls. */
  recentCalls(n: number): TrackedCall[] {
    return this.ledger.calls.slice(-n);
  }
}
