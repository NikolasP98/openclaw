import { describe, expect, it } from "vitest";
import { computePercentiles, renderPrometheusMetrics, type MetricsSnapshot } from "./prometheus-metrics.js";

describe("prometheus-metrics", () => {
  const baseSnapshot: MetricsSnapshot = {
    sessionsTotal: 42,
    sessionsActive: 3,
    llmCallsTotal: 150,
    llmLatencySamples: [0.5, 1.2, 0.8, 2.1, 0.3, 1.5, 0.9, 1.0, 3.2, 0.7],
    toolCalls: new Map([["exec", 30], ["web_search", 15], ["memory_search", 45]]),
    costCentsTotal: 4500,
    costCentsToday: 350,
    tokensInput: 500000,
    tokensOutput: 200000,
    uptimeSeconds: 3600,
  };

  describe("renderPrometheusMetrics", () => {
    it("renders valid Prometheus text format", () => {
      const output = renderPrometheusMetrics(baseSnapshot);
      expect(output).toContain("# HELP minion_sessions_total");
      expect(output).toContain("# TYPE minion_sessions_total counter");
      expect(output).toContain("minion_sessions_total 42");
    });

    it("includes all expected metrics", () => {
      const output = renderPrometheusMetrics(baseSnapshot);
      expect(output).toContain("minion_sessions_active 3");
      expect(output).toContain("minion_llm_calls_total 150");
      expect(output).toContain("minion_cost_cents_total 4500");
      expect(output).toContain("minion_cost_cents_today 350");
      expect(output).toContain("minion_tokens_input_total 500000");
      expect(output).toContain("minion_tokens_output_total 200000");
      expect(output).toContain("minion_uptime_seconds 3600");
    });

    it("renders per-tool call counters", () => {
      const output = renderPrometheusMetrics(baseSnapshot);
      expect(output).toContain('minion_tool_calls_total{tool="exec"} 30');
      expect(output).toContain('minion_tool_calls_total{tool="web_search"} 15');
      expect(output).toContain('minion_tool_calls_total{tool="memory_search"} 45');
    });

    it("renders latency histogram buckets", () => {
      const output = renderPrometheusMetrics(baseSnapshot);
      expect(output).toContain("minion_llm_latency_seconds_bucket");
      expect(output).toContain('{le="0.5"}');
      expect(output).toContain('{le="+Inf"}');
      expect(output).toContain("minion_llm_latency_seconds_sum");
      expect(output).toContain("minion_llm_latency_seconds_count 10");
    });

    it("handles empty latency samples", () => {
      const output = renderPrometheusMetrics({ ...baseSnapshot, llmLatencySamples: [] });
      expect(output).not.toContain("minion_llm_latency_seconds_bucket");
    });

    it("handles empty tool calls", () => {
      const output = renderPrometheusMetrics({ ...baseSnapshot, toolCalls: new Map() });
      expect(output).not.toContain("minion_tool_calls_total{");
    });

    it("escapes label values", () => {
      const snapshot = { ...baseSnapshot, toolCalls: new Map([['tool"with"quotes', 5]]) };
      const output = renderPrometheusMetrics(snapshot);
      expect(output).toContain('tool\\"with\\"quotes');
    });

    it("ends with newline", () => {
      const output = renderPrometheusMetrics(baseSnapshot);
      expect(output.endsWith("\n")).toBe(true);
    });
  });

  describe("computePercentiles", () => {
    it("computes p50 and p95 for sorted array", () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const { p50, p95 } = computePercentiles(sorted);
      expect(p50).toBe(6); // index 5
      expect(p95).toBe(10); // index 9
    });

    it("handles empty array", () => {
      const { p50, p95 } = computePercentiles([]);
      expect(p50).toBe(0);
      expect(p95).toBe(0);
    });

    it("handles single element", () => {
      const { p50, p95 } = computePercentiles([42]);
      expect(p50).toBe(42);
      expect(p95).toBe(42);
    });
  });
});
