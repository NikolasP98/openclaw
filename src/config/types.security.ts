/**
 * Security configuration types — autonomy modes and command risk enforcement.
 *
 * Inspired by ZeroClaw's `src/safety/policy.rs` (ReadOnly/Supervised/Full tiers)
 * and IronClaw's `src/agent/cost_guard.rs` (daily/hourly rate limits).
 */

export type AutonomyLevel = "readonly" | "supervised" | "full";

export type SecurityAutonomyConfig = {
  /**
   * Autonomy mode controlling what shell commands the agent can execute:
   * - `readonly`:    Only LOW risk commands (ls, cat, grep, git status, etc.)
   * - `supervised`:  LOW allowed, MEDIUM/HIGH require explicit approval
   * - `full`:        All commands allowed (risk still logged)
   *
   * Default: `"full"` (backward compatible — no behavior change unless configured).
   */
  level?: AutonomyLevel;

  /**
   * Maximum cost per day in cents (e.g. 5000 = $50/day).
   * LLM calls refused with clear error when exceeded.
   * `undefined` or `0` = unlimited.
   */
  maxCostPerDayCents?: number;

  /**
   * Maximum LLM actions per hour (sliding window).
   * `undefined` or `0` = unlimited.
   */
  maxActionsPerHour?: number;
};
