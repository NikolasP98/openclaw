/**
 * Pipeline step queue — claim, complete, and fail pipeline steps.
 *
 * Steps are stored in SQLite and processed in dependency order.
 * A step is claimable when its status is "pending" and all its
 * dependencies (depends_on) are "completed".
 *
 * @module
 */

import type { DatabaseSync } from "node:sqlite";

// ── Types ────────────────────────────────────────────────────────────────────

export type StepStatus = "pending" | "running" | "completed" | "failed";

export type StepRow = {
  id: string;
  run_id: string;
  name: string;
  status: StepStatus;
  depends_on: string | null;
  input: string | null;
  output: string | null;
  error: string | null;
  claimed_at: number | null;
  completed_at: number | null;
  attempt: number;
};

// ── Queue Operations ─────────────────────────────────────────────────────────

/**
 * Claim the next available step for a pipeline run.
 *
 * A step is claimable when:
 * 1. Its status is "pending"
 * 2. All steps listed in its depends_on (comma-separated step IDs) are "completed"
 *
 * Returns the claimed step, or undefined if none are available.
 */
export function claimStep(db: DatabaseSync, runId: string): StepRow | undefined {
  // Get all pending steps for this run.
  const pendingSteps = db
    .prepare(
      `SELECT * FROM pipeline_steps WHERE run_id = ? AND status = 'pending' ORDER BY rowid ASC`,
    )
    .all(runId) as StepRow[];

  for (const step of pendingSteps) {
    if (step.depends_on) {
      const depIds = step.depends_on.split(",").map((s) => s.trim());
      // Check all dependencies are completed.
      const completedCount = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM pipeline_steps WHERE id IN (${depIds.map(() => "?").join(",")}) AND status = 'completed'`,
        )
        .get(...depIds) as { cnt: number };

      if (completedCount.cnt < depIds.length) {
        continue; // Dependencies not met
      }
    }

    // Claim the step
    const now = Date.now();
    db.prepare(
      `UPDATE pipeline_steps SET status = 'running', claimed_at = ?, attempt = attempt + 1 WHERE id = ?`,
    ).run(now, step.id);

    return {
      ...step,
      status: "running",
      claimed_at: now,
      attempt: step.attempt + 1,
    };
  }

  return undefined;
}

/**
 * Mark a step as completed with output data.
 */
export function completeStep(db: DatabaseSync, stepId: string, output: string): void {
  const now = Date.now();
  db.prepare(
    `UPDATE pipeline_steps SET status = 'completed', output = ?, completed_at = ? WHERE id = ?`,
  ).run(output, now, stepId);
}

/**
 * Mark a step as failed with an error message.
 */
export function failStep(db: DatabaseSync, stepId: string, error: string): void {
  const now = Date.now();
  db.prepare(
    `UPDATE pipeline_steps SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
  ).run(error, now, stepId);
}

/**
 * Get the output of a completed step.
 */
export function getStepOutput(db: DatabaseSync, stepId: string): string | null {
  const row = db.prepare(`SELECT output FROM pipeline_steps WHERE id = ?`).get(stepId) as
    | { output: string | null }
    | undefined;
  return row?.output ?? null;
}

/**
 * Get all steps for a pipeline run.
 */
export function getRunSteps(db: DatabaseSync, runId: string): StepRow[] {
  return db
    .prepare(`SELECT * FROM pipeline_steps WHERE run_id = ? ORDER BY rowid ASC`)
    .all(runId) as StepRow[];
}
