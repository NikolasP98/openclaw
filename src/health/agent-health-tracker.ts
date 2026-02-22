/**
 * Agent health tracker — per-agent runtime health metrics.
 *
 * Tracks response latency, error rate, token usage, and uptime for
 * each agent. Powers the health dashboard and alerting.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type AgentHealthSnapshot = {
  agentId: string;
  status: "healthy" | "degraded" | "down";
  /** Total requests handled. */
  totalRequests: number;
  /** Total errors encountered. */
  totalErrors: number;
  /** Error rate as percentage (0-100). */
  errorRate: number;
  /** Average response latency in ms. */
  avgLatencyMs: number;
  /** P95 latency in ms. */
  p95LatencyMs: number;
  /** Total input tokens consumed. */
  totalInputTokens: number;
  /** Total output tokens generated. */
  totalOutputTokens: number;
  /** Timestamp of last successful response. */
  lastSuccessAt?: number;
  /** Timestamp of last error. */
  lastErrorAt?: number;
  /** Agent uptime in ms since tracking started. */
  uptimeMs: number;
};

export type AgentHealthConfig = {
  /** Error rate threshold for degraded status (default: 10%). */
  degradedErrorRate?: number;
  /** Error rate threshold for down status (default: 50%). */
  downErrorRate?: number;
  /** Max latency samples to keep for percentile calculation (default: 1000). */
  maxLatencySamples?: number;
};

// ── Internal State ───────────────────────────────────────────────────────────

type AgentMetrics = {
  startedAt: number;
  totalRequests: number;
  totalErrors: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastSuccessAt?: number;
  lastErrorAt?: number;
  latencySamples: number[];
};

// ── Implementation ───────────────────────────────────────────────────────────

const DEFAULT_DEGRADED_ERROR_RATE = 10;
const DEFAULT_DOWN_ERROR_RATE = 50;
const DEFAULT_MAX_LATENCY_SAMPLES = 1000;

export class AgentHealthTracker {
  private agents = new Map<string, AgentMetrics>();
  private config: Required<AgentHealthConfig>;

  constructor(config?: AgentHealthConfig) {
    this.config = {
      degradedErrorRate: config?.degradedErrorRate ?? DEFAULT_DEGRADED_ERROR_RATE,
      downErrorRate: config?.downErrorRate ?? DEFAULT_DOWN_ERROR_RATE,
      maxLatencySamples: config?.maxLatencySamples ?? DEFAULT_MAX_LATENCY_SAMPLES,
    };
  }

  /**
   * Record a successful agent response.
   */
  recordSuccess(
    agentId: string,
    latencyMs: number,
    tokens?: { input?: number; output?: number },
  ): void {
    const metrics = this.getOrCreate(agentId);
    metrics.totalRequests++;
    metrics.lastSuccessAt = Date.now();
    metrics.totalInputTokens += tokens?.input ?? 0;
    metrics.totalOutputTokens += tokens?.output ?? 0;
    this.addLatencySample(metrics, latencyMs);
  }

  /**
   * Record an agent error.
   */
  recordError(agentId: string, latencyMs?: number): void {
    const metrics = this.getOrCreate(agentId);
    metrics.totalRequests++;
    metrics.totalErrors++;
    metrics.lastErrorAt = Date.now();
    if (latencyMs !== undefined) {
      this.addLatencySample(metrics, latencyMs);
    }
  }

  /**
   * Get a health snapshot for an agent.
   */
  getSnapshot(agentId: string): AgentHealthSnapshot {
    const metrics = this.getOrCreate(agentId);
    const errorRate =
      metrics.totalRequests > 0 ? (metrics.totalErrors / metrics.totalRequests) * 100 : 0;

    let status: AgentHealthSnapshot["status"] = "healthy";
    if (errorRate >= this.config.downErrorRate) {
      status = "down";
    } else if (errorRate >= this.config.degradedErrorRate) {
      status = "degraded";
    }

    return {
      agentId,
      status,
      totalRequests: metrics.totalRequests,
      totalErrors: metrics.totalErrors,
      errorRate: Math.round(errorRate * 100) / 100,
      avgLatencyMs: this.computeAvgLatency(metrics),
      p95LatencyMs: this.computeP95Latency(metrics),
      totalInputTokens: metrics.totalInputTokens,
      totalOutputTokens: metrics.totalOutputTokens,
      lastSuccessAt: metrics.lastSuccessAt,
      lastErrorAt: metrics.lastErrorAt,
      uptimeMs: Date.now() - metrics.startedAt,
    };
  }

  /**
   * Get snapshots for all tracked agents.
   */
  allSnapshots(): AgentHealthSnapshot[] {
    return [...this.agents.keys()].map((id) => this.getSnapshot(id));
  }

  /**
   * Get IDs of agents in degraded or down state.
   */
  unhealthyAgents(): string[] {
    return this.allSnapshots()
      .filter((s) => s.status !== "healthy")
      .map((s) => s.agentId);
  }

  /**
   * Reset metrics for an agent.
   */
  reset(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * Reset all agent metrics.
   */
  resetAll(): void {
    this.agents.clear();
  }

  private getOrCreate(agentId: string): AgentMetrics {
    let metrics = this.agents.get(agentId);
    if (!metrics) {
      metrics = {
        startedAt: Date.now(),
        totalRequests: 0,
        totalErrors: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        latencySamples: [],
      };
      this.agents.set(agentId, metrics);
    }
    return metrics;
  }

  private addLatencySample(metrics: AgentMetrics, latencyMs: number): void {
    metrics.latencySamples.push(latencyMs);
    if (metrics.latencySamples.length > this.config.maxLatencySamples) {
      metrics.latencySamples.shift();
    }
  }

  private computeAvgLatency(metrics: AgentMetrics): number {
    if (metrics.latencySamples.length === 0) {
      return 0;
    }
    const sum = metrics.latencySamples.reduce((a, b) => a + b, 0);
    return Math.round(sum / metrics.latencySamples.length);
  }

  private computeP95Latency(metrics: AgentMetrics): number {
    if (metrics.latencySamples.length === 0) {
      return 0;
    }
    const sorted = [...metrics.latencySamples].toSorted((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, idx)];
  }
}
