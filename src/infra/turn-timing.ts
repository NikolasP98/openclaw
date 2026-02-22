/**
 * Per-turn timing spans — records model latency, tool execution time,
 * and end-to-end turn duration. Stored in a ring buffer (last N turns).
 *
 * Exposes data via `getTurnTimings()` for the admin performance API.
 *
 * From the improvement mining gap analysis.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("infra/turn-timing");

// ── Types ────────────────────────────────────────────────────────────

export interface TurnTiming {
  /** ISO timestamp when the turn started. */
  startedAt: string;
  /** Agent/session identifier. */
  sessionKey?: string;
  /** Model used for this turn. */
  model?: string;
  /** LLM call latency in milliseconds. */
  modelLatencyMs: number;
  /** Total tool execution time in milliseconds (sum of all tools in this turn). */
  toolLatencyMs: number;
  /** End-to-end turn duration in milliseconds (model + tools + overhead). */
  totalMs: number;
  /** Number of tool calls in this turn. */
  toolCallCount: number;
}

// ── Ring buffer store ────────────────────────────────────────────────

const DEFAULT_MAX_ENTRIES = 1000;

export class TurnTimingStore {
  private buffer: TurnTiming[] = [];
  private maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /** Record a completed turn's timing. */
  record(timing: TurnTiming): void {
    this.buffer.push(timing);
    if (this.buffer.length > this.maxEntries) {
      this.buffer.shift();
    }
  }

  /** Get all recorded timings (most recent last). */
  getAll(): TurnTiming[] {
    return [...this.buffer];
  }

  /** Get the N most recent timings. */
  getRecent(n: number): TurnTiming[] {
    return this.buffer.slice(-n);
  }

  /** Compute summary stats over stored timings. */
  stats(): TurnTimingStats {
    if (this.buffer.length === 0) {
      return {
        count: 0,
        modelLatency: { avgMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 },
        toolLatency: { avgMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 },
        totalLatency: { avgMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 },
      };
    }

    return {
      count: this.buffer.length,
      modelLatency: computeLatencyStats(this.buffer.map((t) => t.modelLatencyMs)),
      toolLatency: computeLatencyStats(this.buffer.map((t) => t.toolLatencyMs)),
      totalLatency: computeLatencyStats(this.buffer.map((t) => t.totalMs)),
    };
  }

  /** Clear all entries. */
  clear(): void {
    this.buffer = [];
  }

  get size(): number {
    return this.buffer.length;
  }
}

// ── Stats computation ────────────────────────────────────────────────

export interface LatencyStats {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

export interface TurnTimingStats {
  count: number;
  modelLatency: LatencyStats;
  toolLatency: LatencyStats;
  totalLatency: LatencyStats;
}

function computeLatencyStats(values: number[]): LatencyStats {
  if (values.length === 0) {
    return { avgMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.floor(sorted.length * 0.95);
  return {
    avgMs: Math.round(sum / sorted.length),
    p50Ms: sorted[Math.min(p50Idx, sorted.length - 1)]!,
    p95Ms: sorted[Math.min(p95Idx, sorted.length - 1)]!,
    minMs: sorted[0]!,
    maxMs: sorted[sorted.length - 1]!,
  };
}

// ── Builder helper ───────────────────────────────────────────────────

/**
 * Helper to build a TurnTiming entry. Use this in the agent loop:
 *
 *   const span = startTurnSpan();
 *   // ... LLM call ...
 *   span.markModelDone();
 *   // ... tool execution ...
 *   span.addToolCall(durationMs);
 *   const timing = span.finish({ model, sessionKey });
 *   store.record(timing);
 */
export function startTurnSpan(): TurnSpanBuilder {
  return new TurnSpanBuilder();
}

class TurnSpanBuilder {
  private startMs = performance.now();
  private modelDoneMs?: number;
  private toolDurations: number[] = [];

  /** Mark the LLM call as completed. */
  markModelDone(): void {
    this.modelDoneMs = performance.now();
  }

  /** Record a tool call duration (call once per tool). */
  addToolCall(durationMs: number): void {
    this.toolDurations.push(durationMs);
  }

  /** Finish the span and return the timing entry. */
  finish(meta?: { model?: string; sessionKey?: string }): TurnTiming {
    const endMs = performance.now();
    const totalMs = Math.round(endMs - this.startMs);
    const modelLatencyMs = this.modelDoneMs
      ? Math.round(this.modelDoneMs - this.startMs)
      : totalMs;
    const toolLatencyMs = Math.round(
      this.toolDurations.reduce((a, b) => a + b, 0),
    );

    return {
      startedAt: new Date().toISOString(),
      sessionKey: meta?.sessionKey,
      model: meta?.model,
      modelLatencyMs,
      toolLatencyMs,
      totalMs,
      toolCallCount: this.toolDurations.length,
    };
  }
}
