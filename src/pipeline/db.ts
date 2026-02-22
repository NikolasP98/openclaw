/**
 * Pipeline SQLite schema — tables for pipeline runs and steps.
 *
 * Uses node:sqlite DatabaseSync for synchronous, zero-dependency SQLite access.
 *
 * @module
 */

import type { DatabaseSync } from "node:sqlite";

/**
 * Create pipeline tables if they don't exist.
 */
export function ensurePipelineSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id TEXT PRIMARY KEY,
      workflow TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      error TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_steps (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES pipeline_runs(id),
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      depends_on TEXT,
      input TEXT,
      output TEXT,
      error TEXT,
      claimed_at INTEGER,
      completed_at INTEGER,
      attempt INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_steps_run_id ON pipeline_steps(run_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_steps_status ON pipeline_steps(status);
  `);
}
