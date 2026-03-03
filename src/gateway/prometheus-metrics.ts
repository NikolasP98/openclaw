/**
 * Prometheus-compatible /metrics endpoint.
 *
 * Emits metrics in standard Prometheus text exposition format.
 * Designed to be scraped by Prometheus/Grafana for local observability.
 *
 * Metrics exported:
 * - minion_sessions_total (counter) — total sessions created
 * - minion_sessions_active (gauge) — currently active sessions
 * - minion_llm_calls_total (counter) — total LLM API calls
 * - minion_llm_latency_seconds (histogram) — model call latency
 * - minion_tool_calls_total (counter) — per-tool call counts
 * - minion_cost_cents_total (counter) — cumulative cost
 * - minion_cost_cents_today (gauge) — today's cost
 * - minion_tokens_total (counter) — total tokens (input+output)
 *
 * From the gap analysis and IronClaw's observability patterns.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface MetricsSnapshot {
  sessionsTotal: number;
  sessionsActive: number;
  llmCallsTotal: number;
  /** Latency values in seconds for histogram computation. */
  llmLatencySamples: number[];
  toolCalls: Map<string, number>;
  costCentsTotal: number;
  costCentsToday: number;
  tokensInput: number;
  tokensOutput: number;
  uptimeSeconds: number;
}

// ── Prometheus format ────────────────────────────────────────────────

/**
 * Render a MetricsSnapshot as Prometheus text exposition format.
 */
export function renderPrometheusMetrics(snapshot: MetricsSnapshot): string {
  const lines: string[] = [];

  // Sessions
  metric(lines, "minion_sessions_total", "counter", "Total sessions created", snapshot.sessionsTotal);
  metric(lines, "minion_sessions_active", "gauge", "Currently active sessions", snapshot.sessionsActive);

  // LLM calls
  metric(lines, "minion_llm_calls_total", "counter", "Total LLM API calls", snapshot.llmCallsTotal);

  // Latency histogram (pre-computed buckets)
  if (snapshot.llmLatencySamples.length > 0) {
    const buckets = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];
    const sorted = [...snapshot.llmLatencySamples].sort((a, b) => a - b);
    lines.push("# HELP minion_llm_latency_seconds LLM call latency in seconds");
    lines.push("# TYPE minion_llm_latency_seconds histogram");
    for (const bound of buckets) {
      const count = sorted.filter((v) => v <= bound).length;
      lines.push(`minion_llm_latency_seconds_bucket{le="${bound}"} ${count}`);
    }
    lines.push(`minion_llm_latency_seconds_bucket{le="+Inf"} ${sorted.length}`);
    const sum = sorted.reduce((a, b) => a + b, 0);
    lines.push(`minion_llm_latency_seconds_sum ${sum.toFixed(6)}`);
    lines.push(`minion_llm_latency_seconds_count ${sorted.length}`);
    lines.push("");
  }

  // Tool calls (per-tool counter)
  if (snapshot.toolCalls.size > 0) {
    lines.push("# HELP minion_tool_calls_total Tool call count by tool name");
    lines.push("# TYPE minion_tool_calls_total counter");
    for (const [name, count] of snapshot.toolCalls) {
      lines.push(`minion_tool_calls_total{tool="${escapeLabelValue(name)}"} ${count}`);
    }
    lines.push("");
  }

  // Cost
  metric(lines, "minion_cost_cents_total", "counter", "Cumulative LLM cost in cents", snapshot.costCentsTotal);
  metric(lines, "minion_cost_cents_today", "gauge", "Today LLM cost in cents", snapshot.costCentsToday);

  // Tokens
  metric(lines, "minion_tokens_input_total", "counter", "Total input tokens", snapshot.tokensInput);
  metric(lines, "minion_tokens_output_total", "counter", "Total output tokens", snapshot.tokensOutput);

  // Uptime
  metric(lines, "minion_uptime_seconds", "gauge", "Gateway uptime in seconds", snapshot.uptimeSeconds);

  return lines.join("\n") + "\n";
}

function metric(lines: string[], name: string, type: string, help: string, value: number): void {
  lines.push(`# HELP ${name} ${help}`);
  lines.push(`# TYPE ${name} ${type}`);
  lines.push(`${name} ${formatValue(value)}`);
  lines.push("");
}

function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(6);
}

function escapeLabelValue(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// ── Latency helpers ──────────────────────────────────────────────────

/**
 * Compute p50 and p95 from a sorted array of values.
 */
export function computePercentiles(sorted: number[]): { p50: number; p95: number } {
  if (sorted.length === 0) return { p50: 0, p95: 0 };
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.floor(sorted.length * 0.95);
  return {
    p50: sorted[Math.min(p50Idx, sorted.length - 1)]!,
    p95: sorted[Math.min(p95Idx, sorted.length - 1)]!,
  };
}
