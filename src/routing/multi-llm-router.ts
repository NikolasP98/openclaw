/**
 * Multi-LLM routing mode — maps (tier, taskType) to a specific model.
 *
 * Extends the complexity scorer's tier output with a task-type dimension so
 * different workloads route to specialist models. Single-model mode (the
 * existing default) is preserved when multiLlm.enabled = false.
 *
 * Resolution order for a given (tier, taskType) pair:
 *   1. Exact match:  tier:taskType  (e.g. "expert:code")
 *   2. Tier fallback: tier           (e.g. "expert")
 *   3. Global default model          (config.defaultModel)
 *   4. null — caller uses its own default
 *
 * All routing decisions are logged when logDecisions = true.
 *
 * @example
 * const model = resolveModelForTurn("expert", "code", config);
 * // → "claude-opus-4-6" (or whatever the table maps to)
 *
 * @module
 */

import type { ModelTier, TaskType } from "./complexity-scorer.js";

// ── Re-exports so callers only need one import ─────────────────────────────────
export type { ModelTier, TaskType };

// ── Types ──────────────────────────────────────────────────────────────────────

/** A single routing table entry. */
export type RoutingEntry = {
  /** Model identifier (e.g. "claude-opus-4-6", "claude-haiku-4-5-20251001"). */
  model: string;
};

/**
 * Lookup key for the routing table.
 * - "tier:taskType" — exact match (highest precedence)
 * - "tier"         — tier-only fallback
 */
export type RoutingKey = `${ModelTier}:${TaskType}` | ModelTier;

/** Routing table: maps RoutingKey → RoutingEntry. */
export type RoutingTable = Partial<Record<RoutingKey, RoutingEntry>>;

/** Config block for multi-LLM routing. */
export type MultiLLMRouterConfig = {
  /** Master switch. When false, resolveModelForTurn always returns null. */
  enabled: boolean;
  /** Per-(tier, taskType) model overrides. */
  routingTable: RoutingTable;
  /** Global fallback model when no table entry matches. */
  defaultModel?: string;
  /** When true, routing decisions are written to console.debug. */
  logDecisions?: boolean;
};

/** Resolution result returned by resolveModelForTurn. */
export type RoutingDecision = {
  /** Resolved model identifier, or null if routing is disabled / no match. */
  model: string | null;
  /** Key that produced the match, or null if fallback/disabled. */
  matchedKey: RoutingKey | "defaultModel" | null;
};

// ── Default routing table ─────────────────────────────────────────────────────

/**
 * Sensible defaults covering the most common specialist routing patterns.
 * Callers may override any entry via config.routingTable.
 */
export const DEFAULT_ROUTING_TABLE: RoutingTable = {
  // Expert tier: heavy tasks → most capable model
  "expert:reasoning": { model: "claude-opus-4-6" },
  "expert:code":      { model: "claude-opus-4-6" },
  "expert:research":  { model: "claude-opus-4-6" },
  "expert:chat":      { model: "claude-sonnet-4-6" },
  // Base tier: standard tasks → balanced model
  "base:code":        { model: "claude-sonnet-4-6" },
  "base:reasoning":   { model: "claude-sonnet-4-6" },
  // Micro tier: fast / cheap
  micro:              { model: "claude-haiku-4-5-20251001" },
  // Nano tier: trivial chat
  nano:               { model: "claude-haiku-4-5-20251001" },
};

// ── Core resolution function ──────────────────────────────────────────────────

/**
 * Resolve the model to use for a given (tier, taskType) pair.
 *
 * @returns RoutingDecision with the resolved model (or null if disabled/unmatched).
 */
export function resolveModelForTurn(
  tier: ModelTier,
  taskType: TaskType,
  config: MultiLLMRouterConfig,
): RoutingDecision {
  if (!config.enabled) {
    return { model: null, matchedKey: null };
  }

  const table = config.routingTable;

  // 1. Exact match
  const exactKey: RoutingKey = `${tier}:${taskType}`;
  const exact = table[exactKey];
  if (exact) {
    maybeLog(config, tier, taskType, exactKey, exact.model);
    return { model: exact.model, matchedKey: exactKey };
  }

  // 2. Tier-only fallback
  const tierEntry = table[tier];
  if (tierEntry) {
    maybeLog(config, tier, taskType, tier, tierEntry.model);
    return { model: tierEntry.model, matchedKey: tier };
  }

  // 3. Global default
  if (config.defaultModel) {
    maybeLog(config, tier, taskType, "defaultModel", config.defaultModel);
    return { model: config.defaultModel, matchedKey: "defaultModel" };
  }

  return { model: null, matchedKey: null };
}

function maybeLog(
  config: MultiLLMRouterConfig,
  tier: ModelTier,
  taskType: TaskType,
  matchedKey: string,
  model: string,
): void {
  if (config.logDecisions) {
    console.debug(
      `[multi-llm-router] tier=${tier} taskType=${taskType} → ${model} (key: ${matchedKey})`,
    );
  }
}

// ── Merge helper ──────────────────────────────────────────────────────────────

/**
 * Merge a partial routing table with the defaults.
 * User-supplied entries take precedence over defaults.
 */
export function buildRoutingTable(overrides?: RoutingTable): RoutingTable {
  return { ...DEFAULT_ROUTING_TABLE, ...overrides };
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Build a fully validated MultiLLMRouterConfig, merging user overrides
 * with the default routing table.
 */
export function createMultiLLMRouter(params: {
  enabled?: boolean;
  routingTableOverrides?: RoutingTable;
  defaultModel?: string;
  logDecisions?: boolean;
}): MultiLLMRouterConfig {
  return {
    enabled: params.enabled ?? false,
    routingTable: buildRoutingTable(params.routingTableOverrides),
    defaultModel: params.defaultModel,
    logDecisions: params.logDecisions ?? false,
  };
}
