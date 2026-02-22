/**
 * Admin cost dashboard endpoint — `GET /admin/costs`.
 *
 * Surfaces existing session-cost-usage.ts data as a structured JSON
 * response for admin dashboards. Supports filtering by date range.
 *
 * Inspired by Moltworker's R2 admin panel and ClawWork's TrackedProvider.
 */

import type {
  CostUsageDailyEntry,
  CostUsageSummary,
  SessionDailyModelUsage,
} from "../infra/session-cost-usage.types.js";

// ── Types ────────────────────────────────────────────────────────────

export interface AdminCostResponse {
  /** Summary for the requested period. */
  summary: {
    totalCost: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    days: number;
  };
  /** Daily breakdown. */
  daily: CostUsageDailyEntry[];
  /** Per-model breakdown across the period. */
  byModel: Array<{
    provider?: string;
    model?: string;
    totalCost: number;
    totalTokens: number;
    callCount: number;
  }>;
  /** Today's running totals. */
  today: {
    cost: number;
    tokens: number;
    date: string;
  };
  /** Generated at timestamp. */
  generatedAt: string;
}

// ── Builder ──────────────────────────────────────────────────────────

/**
 * Build the admin cost response from a CostUsageSummary.
 *
 * The caller is responsible for computing the summary (via existing
 * session-cost-usage.ts functions). This function just reshapes it
 * for the admin API.
 *
 * @param summary - Pre-computed usage summary
 * @param modelUsage - Optional per-model daily usage data
 */
export function buildAdminCostResponse(params: {
  summary: CostUsageSummary;
  modelUsage?: SessionDailyModelUsage[];
}): AdminCostResponse {
  const { summary, modelUsage } = params;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayEntry = summary.daily.find((d) => d.date === todayStr);

  // Aggregate model usage across days.
  const modelMap = new Map<string, { provider?: string; model?: string; cost: number; tokens: number; count: number }>();
  for (const entry of modelUsage ?? []) {
    const key = `${entry.provider ?? "unknown"}/${entry.model ?? "unknown"}`;
    const existing = modelMap.get(key) ?? { provider: entry.provider, model: entry.model, cost: 0, tokens: 0, count: 0 };
    existing.cost += entry.cost;
    existing.tokens += entry.tokens;
    existing.count += entry.count;
    modelMap.set(key, existing);
  }

  return {
    summary: {
      totalCost: summary.totals.totalCost,
      totalTokens: summary.totals.totalTokens,
      inputTokens: summary.totals.input,
      outputTokens: summary.totals.output,
      cacheReadTokens: summary.totals.cacheRead,
      cacheWriteTokens: summary.totals.cacheWrite,
      days: summary.days,
    },
    daily: summary.daily,
    byModel: [...modelMap.values()].map((m) => ({
      provider: m.provider,
      model: m.model,
      totalCost: m.cost,
      totalTokens: m.tokens,
      callCount: m.count,
    })).sort((a, b) => b.totalCost - a.totalCost),
    today: {
      cost: todayEntry?.totalCost ?? 0,
      tokens: todayEntry?.totalTokens ?? 0,
      date: todayStr,
    },
    generatedAt: new Date().toISOString(),
  };
}
