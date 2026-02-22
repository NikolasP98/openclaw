/**
 * Remote backup sync — rclone-based sync with change detection.
 *
 * Syncs local workspace data to an R2/S3-compatible remote using rclone.
 * Detects changes since last sync to avoid unnecessary uploads.
 *
 * @module
 */

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export type RemoteSyncConfig = {
  /** rclone remote name (e.g. "r2:", "s3:mybucket"). */
  remote: string;
  /** Remote path/prefix within the bucket. */
  remotePath?: string;
  /** Local directory to sync. */
  localDir: string;
  /** Paths to exclude from sync (glob patterns). */
  exclude?: string[];
  /** Path to store sync state (checksums). */
  stateFile?: string;
  /** rclone binary path (default: "rclone"). */
  rcloneBin?: string;
  /** Additional rclone flags. */
  extraFlags?: string[];
  /** Dry run — compute changes but don't sync. */
  dryRun?: boolean;
};

export type SyncResult = {
  status: "synced" | "no-changes" | "error";
  filesChanged: number;
  bytesTransferred?: number;
  duration: number;
  error?: string;
};

export type SyncState = {
  lastSyncAt: string;
  checksums: Record<string, string>;
};

// ── Change Detection ─────────────────────────────────────────────────────────

/**
 * Compute a fast checksum for a file using SHA-256 of its content.
 */
export async function fileChecksum(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Scan a directory and compute checksums for all files.
 *
 * Returns a map of relative path → SHA-256 hex hash.
 * Respects exclude patterns (simple glob matching).
 */
export async function scanDirectory(
  dir: string,
  exclude: string[] = [],
): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};

  async function walk(currentDir: string, relativePath: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (shouldExclude(relPath, exclude)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (entry.isFile()) {
        checksums[relPath] = await fileChecksum(fullPath);
      }
    }
  }

  await walk(dir, "");
  return checksums;
}

/**
 * Simple glob-like exclude matching.
 * Supports: exact match, prefix/**, suffix *.ext
 */
export function shouldExclude(filePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern.endsWith("/**")) {
      const prefix = pattern.slice(0, -3);
      if (filePath.startsWith(prefix + "/") || filePath === prefix) {
        return true;
      }
    } else if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1);
      if (filePath.endsWith(ext)) {
        return true;
      }
    } else if (filePath === pattern) {
      return true;
    }
  }
  return false;
}

/**
 * Detect changed files by comparing current checksums against stored state.
 */
export function detectChanges(
  current: Record<string, string>,
  previous: Record<string, string>,
): { added: string[]; modified: string[]; removed: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [file, hash] of Object.entries(current)) {
    if (!(file in previous)) {
      added.push(file);
    } else if (previous[file] !== hash) {
      modified.push(file);
    }
  }

  for (const file of Object.keys(previous)) {
    if (!(file in current)) {
      removed.push(file);
    }
  }

  return { added, modified, removed };
}

// ── Sync State Persistence ───────────────────────────────────────────────────

const DEFAULT_STATE_FILE = ".minion/backup-sync-state.json";

export async function loadSyncState(stateFile: string): Promise<SyncState | null> {
  try {
    const content = await fs.readFile(stateFile, "utf-8");
    return JSON.parse(content) as SyncState;
  } catch {
    return null;
  }
}

export async function saveSyncState(stateFile: string, state: SyncState): Promise<void> {
  const dir = path.dirname(stateFile);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2), "utf-8");
}

// ── rclone Execution ─────────────────────────────────────────────────────────

function buildRcloneArgs(config: RemoteSyncConfig): string[] {
  const remoteDest = config.remotePath ? `${config.remote}${config.remotePath}` : config.remote;

  const args = ["sync", config.localDir, remoteDest, "--progress"];

  for (const pattern of config.exclude ?? []) {
    args.push("--exclude", pattern);
  }

  if (config.dryRun) {
    args.push("--dry-run");
  }

  if (config.extraFlags) {
    args.push(...config.extraFlags);
  }

  return args;
}

/**
 * Execute rclone sync.
 */
export function execRcloneSync(
  config: RemoteSyncConfig,
): Promise<{ stdout: string; stderr: string }> {
  const bin = config.rcloneBin ?? "rclone";
  const args = buildRcloneArgs(config);

  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`rclone failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// ── Main Sync Function ───────────────────────────────────────────────────────

/**
 * Run a backup sync with change detection.
 *
 * 1. Scan local directory for current checksums
 * 2. Compare against stored state to detect changes
 * 3. If changes detected, run rclone sync
 * 4. Update stored state
 */
export async function runBackupSync(config: RemoteSyncConfig): Promise<SyncResult> {
  const startTime = Date.now();
  const stateFile = config.stateFile ?? path.join(config.localDir, DEFAULT_STATE_FILE);

  try {
    const currentChecksums = await scanDirectory(config.localDir, config.exclude);
    const previousState = await loadSyncState(stateFile);
    const previousChecksums = previousState?.checksums ?? {};

    const changes = detectChanges(currentChecksums, previousChecksums);
    const totalChanges = changes.added.length + changes.modified.length + changes.removed.length;

    if (totalChanges === 0) {
      return {
        status: "no-changes",
        filesChanged: 0,
        duration: Date.now() - startTime,
      };
    }

    if (!config.dryRun) {
      await execRcloneSync(config);
    }

    await saveSyncState(stateFile, {
      lastSyncAt: new Date().toISOString(),
      checksums: currentChecksums,
    });

    return {
      status: "synced",
      filesChanged: totalChanges,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    return {
      status: "error",
      filesChanged: 0,
      duration: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** @internal — exposed for tests */
export const _internals = {
  buildRcloneArgs,
  DEFAULT_STATE_FILE,
} as const;
