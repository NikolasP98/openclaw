/**
 * Memory snapshot — export/hydrate.
 *
 * Exports core memory files (SOUL.md, USER.md, MEMORY.md, recent daily notes)
 * into a single human-readable MEMORY_SNAPSHOT.md file. On cold boot, if core
 * memory files are missing but a snapshot exists, the snapshot is hydrated back
 * into individual files.
 *
 * The snapshot is Git-friendly (plain Markdown) and travels with the config,
 * solving the "lost memory on reinstall" problem.
 *
 * Inspired by ZeroClaw's snapshot export/hydrate pattern.
 *
 * @module
 */

import fs from "node:fs/promises";
import path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export type SnapshotConfig = {
  /** Enable periodic snapshot export (default: false). */
  enabled?: boolean;
  /** Export interval in hours (default: 6). */
  intervalHours?: number;
  /** Number of recent daily notes to include (default: 7). */
  recentDays?: number;
};

export type SnapshotExportResult = {
  status: "exported" | "skipped" | "error";
  path?: string;
  reason?: string;
};

export type SnapshotHydrateResult = {
  status: "hydrated" | "skipped" | "error";
  restoredFiles?: string[];
  reason?: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const SNAPSHOT_FILENAME = "MEMORY_SNAPSHOT.md";
const CORE_FILES = ["SOUL.md", "USER.md", "MEMORY.md"] as const;
const DEFAULT_RECENT_DAYS = 7;
const DATED_NOTE_RE = /^(\d{4})-(\d{2})-(\d{2})\.md$/;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listDailyNotes(memoryDir: string, limit: number): Promise<string[]> {
  try {
    const entries = await fs.readdir(memoryDir);
    return entries
      .filter((name) => DATED_NOTE_RE.test(name))
      .toSorted()
      .slice(-limit); // most recent
  } catch {
    return [];
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Export core memory files to MEMORY_SNAPSHOT.md.
 */
export async function exportSnapshot(params: {
  workspaceDir: string;
  config?: SnapshotConfig;
}): Promise<SnapshotExportResult> {
  const { workspaceDir, config } = params;
  const recentDays = config?.recentDays ?? DEFAULT_RECENT_DAYS;
  const snapshotPath = path.join(workspaceDir, SNAPSHOT_FILENAME);

  const sections: string[] = [];
  sections.push(`# Memory Snapshot`);
  sections.push(`> Exported: ${new Date().toISOString()}`);
  sections.push("");

  // Core files
  let hasContent = false;
  for (const fileName of CORE_FILES) {
    const content = await readFileSafe(path.join(workspaceDir, fileName));
    if (content.trim()) {
      const sectionName = fileName.replace(".md", "").toUpperCase();
      sections.push(`## ${sectionName}`);
      sections.push(content.trim());
      sections.push("");
      hasContent = true;
    }
  }

  // Recent daily notes
  const memoryDir = path.join(workspaceDir, "memory");
  const dailyNotes = await listDailyNotes(memoryDir, recentDays);
  if (dailyNotes.length > 0) {
    sections.push("## Recent Daily Notes");
    sections.push("");
    for (const fileName of dailyNotes) {
      const content = await readFileSafe(path.join(memoryDir, fileName));
      if (content.trim()) {
        sections.push(`### ${fileName}`);
        sections.push(content.trim());
        sections.push("");
        hasContent = true;
      }
    }
  }

  if (!hasContent) {
    return { status: "skipped", reason: "no memory content to export" };
  }

  try {
    await fs.writeFile(snapshotPath, sections.join("\n"), "utf-8");
    return { status: "exported", path: snapshotPath };
  } catch (err) {
    return { status: "error", reason: `Failed to write snapshot: ${String(err)}` };
  }
}

// ── Hydrate ──────────────────────────────────────────────────────────────────

/**
 * Parse a MEMORY_SNAPSHOT.md file into sections.
 */
function parseSnapshot(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = content.split("\n");
  let currentSection = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      if (currentSection && currentContent.length > 0) {
        sections.set(currentSection, currentContent.join("\n").trim());
      }
      currentSection = h2[1].trim();
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  if (currentSection && currentContent.length > 0) {
    sections.set(currentSection, currentContent.join("\n").trim());
  }

  return sections;
}

/** Map snapshot section names to file names. */
const SECTION_TO_FILE: Record<string, string> = {
  SOUL: "SOUL.md",
  USER: "USER.md",
  MEMORY: "MEMORY.md",
};

/**
 * Hydrate core memory files from MEMORY_SNAPSHOT.md.
 *
 * Only restores files that are missing — never overwrites existing files.
 */
export async function hydrateFromSnapshot(params: {
  workspaceDir: string;
}): Promise<SnapshotHydrateResult> {
  const { workspaceDir } = params;
  const snapshotPath = path.join(workspaceDir, SNAPSHOT_FILENAME);

  if (!(await fileExists(snapshotPath))) {
    return { status: "skipped", reason: "no snapshot file found" };
  }

  // Check if any core file is missing
  const missingFiles: string[] = [];
  for (const fileName of CORE_FILES) {
    if (!(await fileExists(path.join(workspaceDir, fileName)))) {
      missingFiles.push(fileName);
    }
  }

  if (missingFiles.length === 0) {
    return { status: "skipped", reason: "all core memory files already exist" };
  }

  const snapshotContent = await readFileSafe(snapshotPath);
  if (!snapshotContent.trim()) {
    return { status: "skipped", reason: "snapshot file is empty" };
  }

  const sections = parseSnapshot(snapshotContent);
  const restored: string[] = [];

  for (const [sectionName, fileName] of Object.entries(SECTION_TO_FILE)) {
    if (!missingFiles.includes(fileName)) {
      continue;
    }
    const content = sections.get(sectionName);
    if (!content) {
      continue;
    }

    try {
      await fs.writeFile(path.join(workspaceDir, fileName), content, "utf-8");
      restored.push(fileName);
    } catch {
      // Non-fatal — continue restoring other files
    }
  }

  if (restored.length === 0) {
    return { status: "skipped", reason: "snapshot contained no data for missing files" };
  }

  return { status: "hydrated", restoredFiles: restored };
}
