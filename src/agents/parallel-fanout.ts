/**
 * Parallel sub-agent fan-out — spawn N agents simultaneously and join results.
 *
 * Enables patterns like "research 5 topics in parallel, then synthesize"
 * by spawning concurrent sub-agent sessions with different prompts and
 * collecting all results before returning to the orchestrator.
 *
 * Respects existing sub-agent depth limits and concurrency caps.
 *
 * Inspired by Antfarm's multi-agent pipeline and NanoClaw's concurrency cap.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agents/parallel-fanout");

// ── Types ────────────────────────────────────────────────────────────

export interface FanoutTask {
  /** Unique label for this task (used as result key). */
  label: string;
  /** Prompt to send to the sub-agent. */
  prompt: string;
  /** Optional: tool policy preset for this sub-agent. */
  role?: string;
  /** Optional: model override for this sub-agent. */
  model?: string;
}

export interface FanoutResult {
  label: string;
  /** Sub-agent output text. */
  output: string;
  /** Whether the sub-agent completed successfully. */
  success: boolean;
  /** Error message if failed. */
  error?: string;
  /** Duration in milliseconds. */
  durationMs: number;
}

export interface FanoutSummary {
  total: number;
  succeeded: number;
  failed: number;
  totalDurationMs: number;
  results: FanoutResult[];
}

export interface FanoutConfig {
  /** Maximum concurrent sub-agents (default: 5). */
  maxConcurrency?: number;
  /** Timeout per sub-agent in ms (default: 5 minutes). */
  timeoutMs?: number;
}

// ── Implementation ───────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENCY = 5;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export type SpawnFn = (task: FanoutTask) => Promise<string>;

/**
 * Execute multiple sub-agent tasks in parallel with concurrency control.
 *
 * @param tasks - Array of tasks to execute
 * @param spawnFn - Function that spawns a sub-agent and returns its output
 * @param config - Concurrency and timeout settings
 */
export async function executeFanout(
  tasks: FanoutTask[],
  spawnFn: SpawnFn,
  config?: FanoutConfig,
): Promise<FanoutSummary> {
  const maxConcurrency = config?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  const timeoutMs = config?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (tasks.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, totalDurationMs: 0, results: [] };
  }

  const capped = tasks.slice(0, maxConcurrency);
  if (tasks.length > maxConcurrency) {
    log.warn(`Fan-out capped at ${maxConcurrency} (requested ${tasks.length})`);
  }

  const startTime = performance.now();
  log.debug(`Starting fan-out: ${capped.length} parallel tasks`);

  const results = await Promise.all(
    capped.map((task) => executeWithTimeout(task, spawnFn, timeoutMs)),
  );

  const totalDurationMs = Math.round(performance.now() - startTime);
  const succeeded = results.filter((r) => r.success).length;

  log.debug(`Fan-out complete: ${succeeded}/${capped.length} succeeded in ${totalDurationMs}ms`);

  return {
    total: capped.length,
    succeeded,
    failed: capped.length - succeeded,
    totalDurationMs,
    results,
  };
}

async function executeWithTimeout(
  task: FanoutTask,
  spawnFn: SpawnFn,
  timeoutMs: number,
): Promise<FanoutResult> {
  const start = performance.now();
  try {
    const output = await Promise.race([
      spawnFn(task),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return {
      label: task.label,
      output,
      success: true,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.warn(`Fan-out task "${task.label}" failed: ${error}`);
    return {
      label: task.label,
      output: "",
      success: false,
      error,
      durationMs: Math.round(performance.now() - start),
    };
  }
}

/**
 * Format fan-out results for injection into an orchestrator prompt.
 */
export function formatFanoutResults(summary: FanoutSummary): string {
  const lines = [`## Parallel Research Results (${summary.succeeded}/${summary.total} succeeded)\n`];
  for (const result of summary.results) {
    lines.push(`### ${result.label}`);
    if (result.success) {
      lines.push(result.output);
    } else {
      lines.push(`**FAILED**: ${result.error ?? "unknown error"}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
