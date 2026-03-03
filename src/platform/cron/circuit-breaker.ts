/**
 * Cron circuit breaker — suspend jobs after consecutive failures.
 *
 * After N consecutive failures, the job is suspended and a HEARTBEAT.md
 * entry is emitted. Auto-resumes after a configurable cooldown period.
 *
 * Prevents token burn from stuck cron loops where a failing job retries
 * every N minutes indefinitely.
 *
 * Inspired by Antfarm's cron safety patterns.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("cron/circuit-breaker");

// ── Types ────────────────────────────────────────────────────────────

export interface CircuitBreakerConfig {
  /** Consecutive failures before suspension (default: 3). */
  maxFailures?: number;
  /** Cooldown period in ms before auto-resume (default: 1 hour). */
  cooldownMs?: number;
}

export type CircuitState = "closed" | "open" | "half-open";

export interface JobCircuitState {
  name: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt?: number;
  suspendedAt?: number;
  resumeAt?: number;
}

// ── Implementation ───────────────────────────────────────────────────

const DEFAULT_MAX_FAILURES = 3;
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export class CronCircuitBreaker {
  private jobs = new Map<string, JobCircuitState>();
  private config: Required<CircuitBreakerConfig>;

  constructor(config?: CircuitBreakerConfig) {
    this.config = {
      maxFailures: config?.maxFailures ?? DEFAULT_MAX_FAILURES,
      cooldownMs: config?.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    };
  }

  /**
   * Check if a job is allowed to execute.
   *
   * Returns true if the circuit is closed (normal) or half-open (probe).
   * Returns false if the circuit is open (suspended).
   */
  canExecute(jobName: string): boolean {
    const job = this.getOrCreate(jobName);

    if (job.state === "closed") {
      return true;
    }

    if (job.state === "open") {
      // Check if cooldown has elapsed → transition to half-open.
      if (job.resumeAt && Date.now() >= job.resumeAt) {
        job.state = "half-open";
        log.debug(`Circuit half-open for ${jobName} (cooldown elapsed, probing)`);
        return true;
      }
      return false;
    }

    // half-open: allow one probe execution.
    return true;
  }

  /**
   * Record a successful execution. Resets the failure counter.
   */
  recordSuccess(jobName: string): void {
    const job = this.getOrCreate(jobName);
    const wasSuspended = job.state !== "closed";
    job.consecutiveFailures = 0;
    job.state = "closed";
    job.suspendedAt = undefined;
    job.resumeAt = undefined;
    if (wasSuspended) {
      log.debug(`Circuit closed for ${jobName} (recovered after suspension)`);
    }
  }

  /**
   * Record a failed execution.
   *
   * Returns a HEARTBEAT.md entry string if the circuit just opened (newly suspended).
   * Returns undefined if the circuit was already open or hasn't hit the threshold.
   */
  recordFailure(jobName: string): string | undefined {
    const job = this.getOrCreate(jobName);
    job.consecutiveFailures++;
    job.lastFailureAt = Date.now();

    if (job.state === "half-open") {
      // Probe failed → back to open with fresh cooldown.
      job.state = "open";
      job.suspendedAt = Date.now();
      job.resumeAt = Date.now() + this.config.cooldownMs;
      log.warn(
        `Circuit re-opened for ${jobName} (probe failed, ${job.consecutiveFailures} total failures)`,
      );
      return undefined; // Already reported when first suspended.
    }

    if (job.consecutiveFailures >= this.config.maxFailures && job.state === "closed") {
      job.state = "open";
      job.suspendedAt = Date.now();
      job.resumeAt = Date.now() + this.config.cooldownMs;
      const cooldownMin = Math.round(this.config.cooldownMs / 60_000);
      log.warn(
        `Circuit OPEN for ${jobName}: ${job.consecutiveFailures} consecutive failures. Suspended for ${cooldownMin}m.`,
      );
      return `- [ ] cron/${jobName} suspended after ${job.consecutiveFailures} failures (auto-resume in ${cooldownMin}m)`;
    }

    return undefined;
  }

  /** Get the current state of a job's circuit. */
  getState(jobName: string): JobCircuitState {
    return { ...this.getOrCreate(jobName) };
  }

  /** Get all suspended jobs. */
  getSuspended(): JobCircuitState[] {
    return [...this.jobs.values()].filter((j) => j.state === "open").map((j) => ({ ...j }));
  }

  /** Manually reset a job's circuit (e.g. via CLI). */
  reset(jobName: string): void {
    this.jobs.delete(jobName);
    log.debug(`Circuit manually reset for ${jobName}`);
  }

  /** Get all tracked job states (for status display). */
  allStates(): JobCircuitState[] {
    return [...this.jobs.values()].map((j) => ({ ...j }));
  }

  private getOrCreate(jobName: string): JobCircuitState {
    let job = this.jobs.get(jobName);
    if (!job) {
      job = { name: jobName, state: "closed", consecutiveFailures: 0 };
      this.jobs.set(jobName, job);
    }
    return job;
  }
}
