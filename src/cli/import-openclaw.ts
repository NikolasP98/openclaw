/**
 * `minion import --from openclaw` migration command.
 *
 * Reads an existing OpenClaw config, maps keys to Minion equivalents,
 * copies workspace files (SOUL.md, memory/, skills/), and reports
 * what couldn't be automatically migrated.
 *
 * Inspired by PicoClaw's workspace migration pattern.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";

const log = createSubsystemLogger("cli/import-openclaw");

// ── Types ────────────────────────────────────────────────────────────

export interface MigrationReport {
  /** Successfully mapped config keys. */
  mapped: Array<{ source: string; target: string; value: unknown }>;
  /** Config keys that couldn't be mapped (need manual setup). */
  unmapped: Array<{ key: string; value: unknown; reason: string }>;
  /** Files copied. */
  copiedFiles: string[];
  /** Files that failed to copy. */
  failedFiles: Array<{ path: string; reason: string }>;
  /** Warnings for the user. */
  warnings: string[];
}

// ── Config key mapping ───────────────────────────────────────────────

/** Maps OpenClaw config paths → Minion config paths (flat for simplicity). */
const CONFIG_KEY_MAP: Record<string, string> = {
  // Models
  "models.default": "models.default",
  "models.providers": "models.providers",

  // Gateway
  "gateway.port": "gateway.port",
  "gateway.host": "gateway.host",

  // Channels
  "channels.telegram.token": "channels.telegram.token",
  "channels.telegram.allowFrom": "channels.telegram.allowFrom",
  "channels.whatsapp": "channels.whatsapp",
  "channels.discord.token": "channels.discord.token",
  "channels.slack.token": "channels.slack.token",

  // Memory
  "memory": "memory",

  // Tools
  "tools.allow": "tools.allow",
  "tools.deny": "tools.deny",

  // Hooks
  "hooks": "hooks",

  // Skills
  "skills": "skills",

  // Cron
  "cron": "cron",
};

/** Config keys that exist in OpenClaw but NOT in Minion (or need manual handling). */
const UNMAPPABLE_KEYS = new Set([
  "claude.apiKey", // Should be in env var, not config
  "anthropic.apiKey",
]);

// ── Workspace files to copy ──────────────────────────────────────────

const WORKSPACE_FILES = [
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "HEARTBEAT.md",
  "AGENTS.md",
  "TOOLS.md",
];

const WORKSPACE_DIRS = [
  "memory",
  "skills",
  "sessions",
  "daily",
];

// ── Implementation ───────────────────────────────────────────────────

/**
 * Get a nested value from an object using dot-notation path.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Set a nested value on an object using dot-notation path.
 */
function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const keys = dotPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!current[key] || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}

/**
 * Read and parse an OpenClaw config file.
 */
export async function readOpenClawConfig(
  configPath?: string,
): Promise<Record<string, unknown>> {
  const defaultPaths = [
    "~/.config/openclaw/config.json",
    "~/.openclaw/openclaw.json",
    "~/.config/openclaw/openclaw.json",
  ];

  const candidates = configPath ? [configPath] : defaultPaths;

  for (const candidate of candidates) {
    const resolved = resolveUserPath(candidate);
    try {
      const content = await fs.readFile(resolved, "utf-8");
      log.debug(`Found OpenClaw config at: ${resolved}`);
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      continue;
    }
  }

  throw new Error(
    `No OpenClaw config found. Tried: ${candidates.map(resolveUserPath).join(", ")}`,
  );
}

/**
 * Map OpenClaw config to Minion config and produce a migration report.
 */
export function migrateConfig(
  openclawConfig: Record<string, unknown>,
): { minionConfig: Record<string, unknown>; report: MigrationReport } {
  const minionConfig: Record<string, unknown> = {};
  const report: MigrationReport = {
    mapped: [],
    unmapped: [],
    copiedFiles: [],
    failedFiles: [],
    warnings: [],
  };

  // Map known keys.
  for (const [sourceKey, targetKey] of Object.entries(CONFIG_KEY_MAP)) {
    const value = getNestedValue(openclawConfig, sourceKey);
    if (value !== undefined) {
      setNestedValue(minionConfig, targetKey, value);
      report.mapped.push({ source: sourceKey, target: targetKey, value });
    }
  }

  // Find unmapped keys.
  const allKeys = flattenKeys(openclawConfig);
  for (const key of allKeys) {
    if (CONFIG_KEY_MAP[key]) continue;
    // Check if any prefix of this key is mapped.
    const prefixMapped = Object.keys(CONFIG_KEY_MAP).some(
      (mapped) => key.startsWith(mapped + "."),
    );
    if (prefixMapped) continue;

    const value = getNestedValue(openclawConfig, key);
    if (UNMAPPABLE_KEYS.has(key)) {
      report.warnings.push(`'${key}' contains a secret — set it as an env var instead of in config.`);
    } else {
      report.unmapped.push({ key, value, reason: "no mapping defined" });
    }
  }

  return { minionConfig, report };
}

/**
 * Copy workspace files from OpenClaw workspace to Minion workspace.
 */
export async function copyWorkspaceFiles(params: {
  sourceDir: string;
  targetDir: string;
  report: MigrationReport;
}): Promise<void> {
  const { sourceDir, targetDir, report } = params;
  const sourcePath = resolveUserPath(sourceDir);
  const targetPath = resolveUserPath(targetDir);

  await fs.mkdir(targetPath, { recursive: true });

  // Copy individual files.
  for (const file of WORKSPACE_FILES) {
    const src = path.join(sourcePath, file);
    const dst = path.join(targetPath, file);
    try {
      await fs.access(src);
      // Don't overwrite existing files.
      try {
        await fs.access(dst);
        report.warnings.push(`Skipped '${file}' — already exists in target.`);
      } catch {
        await fs.copyFile(src, dst);
        report.copiedFiles.push(file);
      }
    } catch {
      // Source file doesn't exist — skip.
    }
  }

  // Copy directories.
  for (const dir of WORKSPACE_DIRS) {
    const src = path.join(sourcePath, dir);
    const dst = path.join(targetPath, dir);
    try {
      const stat = await fs.stat(src);
      if (!stat.isDirectory()) continue;
      await fs.mkdir(dst, { recursive: true });
      await copyDirContents(src, dst, report);
    } catch {
      // Source dir doesn't exist — skip.
    }
  }
}

async function copyDirContents(
  src: string,
  dst: string,
  report: MigrationReport,
): Promise<void> {
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(dstPath, { recursive: true });
      await copyDirContents(srcPath, dstPath, report);
    } else {
      try {
        await fs.access(dstPath);
        // Don't overwrite.
      } catch {
        await fs.copyFile(srcPath, dstPath);
        report.copiedFiles.push(path.relative(dst, dstPath));
      }
    }
  }
}

/**
 * Flatten an object's keys to dot-notation paths (top 2 levels only
 * to avoid deep-traversing arrays/complex objects).
 */
function flattenKeys(obj: Record<string, unknown>, prefix = "", depth = 0): string[] {
  if (depth > 2) return prefix ? [prefix] : [];
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey, depth + 1));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Format a migration report as human-readable text.
 */
export function formatReport(report: MigrationReport): string {
  const lines: string[] = ["# Migration Report", ""];

  if (report.mapped.length > 0) {
    lines.push(`## Mapped (${report.mapped.length} keys)`);
    for (const m of report.mapped) {
      lines.push(`  ${m.source} → ${m.target}`);
    }
    lines.push("");
  }

  if (report.unmapped.length > 0) {
    lines.push(`## Unmapped (${report.unmapped.length} keys — need manual config)`);
    for (const u of report.unmapped) {
      lines.push(`  ${u.key}: ${u.reason}`);
    }
    lines.push("");
  }

  if (report.copiedFiles.length > 0) {
    lines.push(`## Copied Files (${report.copiedFiles.length})`);
    for (const f of report.copiedFiles) {
      lines.push(`  ${f}`);
    }
    lines.push("");
  }

  if (report.warnings.length > 0) {
    lines.push(`## Warnings`);
    for (const w of report.warnings) {
      lines.push(`  ⚠ ${w}`);
    }
    lines.push("");
  }

  if (report.failedFiles.length > 0) {
    lines.push(`## Failed`);
    for (const f of report.failedFiles) {
      lines.push(`  ✗ ${f.path}: ${f.reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
