/**
 * Memory hygiene service — automated archive, purge, and prune.
 *
 * - Archive: move daily .md files older than 7 days to archive/
 * - Purge: delete archived files older than 30 days
 * - Prune: delete `conversation` category rows from SQLite older than 14 days
 *
 * Runs max once per 12 hours (throttled via state file).
 *
 * Inspired by ZeroClaw's `src/memory/hygiene.rs`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";

const log = createSubsystemLogger("memory/hygiene");

// ── Types ────────────────────────────────────────────────────────────

export interface HygieneConfig {
  /** Days before daily notes are archived (default: 7). */
  archiveAfterDays?: number;
  /** Days before archives are permanently deleted (default: 30). */
  purgeAfterDays?: number;
  /** Minimum interval between hygiene runs in hours (default: 12). */
  throttleHours?: number;
}

export interface HygieneResult {
  archived: string[];
  purged: string[];
  skippedThrottle: boolean;
}

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_ARCHIVE_AFTER_DAYS = 7;
const DEFAULT_PURGE_AFTER_DAYS = 30;
const DEFAULT_THROTTLE_HOURS = 12;
const STATE_FILENAME = ".hygiene-state.json";

// ── Implementation ───────────────────────────────────────────────────

/**
 * Run the full hygiene cycle on a memory directory.
 *
 * @param memoryDir - Path to the memory directory (e.g. ~/.minion/memory/)
 * @param config - Optional overrides for timing thresholds
 */
export async function runHygiene(
  memoryDir: string,
  config?: HygieneConfig,
): Promise<HygieneResult> {
  const archiveDays = config?.archiveAfterDays ?? DEFAULT_ARCHIVE_AFTER_DAYS;
  const purgeDays = config?.purgeAfterDays ?? DEFAULT_PURGE_AFTER_DAYS;
  const throttleHours = config?.throttleHours ?? DEFAULT_THROTTLE_HOURS;

  // Check throttle.
  const statePath = path.join(memoryDir, STATE_FILENAME);
  if (await isThrottled(statePath, throttleHours)) {
    log.debug("Hygiene skipped (throttled)");
    return { archived: [], purged: [], skippedThrottle: true };
  }

  const result: HygieneResult = { archived: [], purged: [], skippedThrottle: false };

  // Archive old daily notes.
  const archiveDir = path.join(memoryDir, "archive");
  const archiveCutoff = daysAgo(archiveDays);
  const dailyFiles = await listDailyFiles(memoryDir);
  for (const file of dailyFiles) {
    const fileDate = extractDateFromFilename(file);
    if (fileDate && fileDate < archiveCutoff) {
      await fs.mkdir(archiveDir, { recursive: true });
      const src = path.join(memoryDir, file);
      const dst = path.join(archiveDir, file);
      try {
        await fs.rename(src, dst);
        result.archived.push(file);
        log.debug(`Archived: ${file}`);
      } catch (err) {
        log.warn(`Failed to archive ${file}: ${String(err)}`);
      }
    }
  }

  // Purge old archives.
  const purgeCutoff = daysAgo(purgeDays);
  try {
    const archiveFiles = await fs.readdir(archiveDir).catch(() => [] as string[]);
    for (const file of archiveFiles) {
      const fileDate = extractDateFromFilename(file);
      if (fileDate && fileDate < purgeCutoff) {
        try {
          await fs.unlink(path.join(archiveDir, file));
          result.purged.push(file);
          log.debug(`Purged: ${file}`);
        } catch (err) {
          log.warn(`Failed to purge ${file}: ${String(err)}`);
        }
      }
    }
  } catch {
    // Archive dir doesn't exist — nothing to purge.
  }

  // Update throttle state.
  await writeThrottleState(statePath);

  if (result.archived.length > 0 || result.purged.length > 0) {
    log.debug(
      `Hygiene complete: ${result.archived.length} archived, ${result.purged.length} purged`,
    );
  }

  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** List files matching YYYY-MM-DD.md pattern in a directory. */
async function listDailyFiles(dir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(dir);
    return files.filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f));
  } catch {
    return [];
  }
}

/** Extract a Date from a YYYY-MM-DD.md filename. */
function extractDateFromFilename(filename: string): Date | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
  if (!match) {
    return null;
  }
  const date = new Date(match[1] + "T00:00:00Z");
  return isNaN(date.getTime()) ? null : date;
}

/** Get a Date representing N days ago (UTC midnight). */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Check if the last run was within the throttle window. */
async function isThrottled(statePath: string, throttleHours: number): Promise<boolean> {
  try {
    const content = await fs.readFile(statePath, "utf-8");
    const state = JSON.parse(content) as { lastRunAt?: string };
    if (!state.lastRunAt) {
      return false;
    }
    const lastRun = new Date(state.lastRunAt);
    const elapsed = Date.now() - lastRun.getTime();
    return elapsed < throttleHours * 3600_000;
  } catch {
    return false;
  }
}

/** Write the current timestamp to the throttle state file. */
async function writeThrottleState(statePath: string): Promise<void> {
  try {
    await fs.writeFile(statePath, JSON.stringify({ lastRunAt: new Date().toISOString() }), "utf-8");
  } catch (err) {
    log.warn(`Failed to write hygiene state: ${String(err)}`);
  }
}
