/**
 * Cost guard — hard daily and hourly enforcement limits.
 *
 * Tracks cumulative LLM spend and action count, refusing new LLM calls
 * when configured limits are exceeded. Especially critical for autonomous
 * modes (heartbeat, cron) where the agent acts without human oversight.
 *
 * Inspired by IronClaw's `src/agent/cost_guard.rs`.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("infra/cost-guard");

// ── Types ────────────────────────────────────────────────────────────

export interface CostGuardConfig {
  /** Maximum spend per day in cents (e.g. 5000 = $50). 0 or undefined = unlimited. */
  maxCostPerDayCents?: number;
  /** Maximum LLM actions per hour (sliding window). 0 or undefined = unlimited. */
  maxActionsPerHour?: number;
}

export type CostLimitExceeded =
  | { type: "daily_budget"; spentCents: number; limitCents: number }
  | { type: "hourly_rate"; actions: number; limit: number };

// ── Implementation ───────────────────────────────────────────────────

export class CostGuard {
  private config: CostGuardConfig;

  /** Accumulated cost today in cents. Resets at UTC midnight. */
  private dailyCostCents = 0;
  /** UTC day string (YYYY-MM-DD) for the current accumulation period. */
  private currentDay: string;

  /** Sliding window of action timestamps for hourly rate limiting. */
  private actionTimestamps: number[] = [];

  constructor(config: CostGuardConfig) {
    this.config = config;
    this.currentDay = utcDay();
  }

  /**
   * Record a completed LLM action with its cost.
   * Call this after each LLM response is received.
   */
  recordAction(costCents: number): void {
    this.maybeResetDay();
    this.dailyCostCents += costCents;
    this.actionTimestamps.push(Date.now());
    this.pruneActionWindow();
  }

  /**
   * Check whether the next LLM call should be allowed.
   * Returns `null` if allowed, or a `CostLimitExceeded` describing why not.
   */
  check(): CostLimitExceeded | null {
    this.maybeResetDay();
    this.pruneActionWindow();

    // Daily budget check.
    const maxDaily = this.config.maxCostPerDayCents;
    if (maxDaily && maxDaily > 0 && this.dailyCostCents >= maxDaily) {
      const exceeded: CostLimitExceeded = {
        type: "daily_budget",
        spentCents: this.dailyCostCents,
        limitCents: maxDaily,
      };
      log.warn(
        `Daily budget exceeded: $${(this.dailyCostCents / 100).toFixed(2)} of $${(maxDaily / 100).toFixed(2)}`,
      );
      return exceeded;
    }

    // Hourly rate check.
    const maxHourly = this.config.maxActionsPerHour;
    if (maxHourly && maxHourly > 0 && this.actionTimestamps.length >= maxHourly) {
      const exceeded: CostLimitExceeded = {
        type: "hourly_rate",
        actions: this.actionTimestamps.length,
        limit: maxHourly,
      };
      log.warn(
        `Hourly rate limit exceeded: ${this.actionTimestamps.length} actions of ${maxHourly} allowed`,
      );
      return exceeded;
    }

    return null;
  }

  /** Format a `CostLimitExceeded` into a user-facing error message. */
  static formatError(exceeded: CostLimitExceeded): string {
    if (exceeded.type === "daily_budget") {
      return `Daily cost limit exceeded: spent $${(exceeded.spentCents / 100).toFixed(2)} of $${(exceeded.limitCents / 100).toFixed(2)} allowed. Resets at UTC midnight.`;
    }
    return `Hourly action limit exceeded: ${exceeded.actions} actions of ${exceeded.limit} allowed per hour. Wait and try again.`;
  }

  /** Get current stats (for admin/status endpoints). */
  stats(): {
    dailyCostCents: number;
    actionsThisHour: number;
    currentDay: string;
    config: CostGuardConfig;
  } {
    this.maybeResetDay();
    this.pruneActionWindow();
    return {
      dailyCostCents: this.dailyCostCents,
      actionsThisHour: this.actionTimestamps.length,
      currentDay: this.currentDay,
      config: this.config,
    };
  }

  /** Reset daily counter if the UTC day has changed. */
  private maybeResetDay(): void {
    const today = utcDay();
    if (today !== this.currentDay) {
      log.debug(
        `Day rolled over: ${this.currentDay} → ${today}. Reset daily cost from ${this.dailyCostCents}c.`,
      );
      this.dailyCostCents = 0;
      this.currentDay = today;
    }
  }

  /** Remove action timestamps older than 1 hour. */
  private pruneActionWindow(): void {
    const oneHourAgo = Date.now() - 3600_000;
    while (this.actionTimestamps.length > 0 && this.actionTimestamps[0]! < oneHourAgo) {
      this.actionTimestamps.shift();
    }
  }
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}
