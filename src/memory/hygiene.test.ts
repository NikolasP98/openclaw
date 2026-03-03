import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHygiene } from "./hygiene.js";

describe("memory-hygiene", () => {
  let memDir: string;

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "hygiene-test-"));
    memDir = path.join(tmp, "memory");
    await fs.mkdir(memDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(path.dirname(memDir), { recursive: true, force: true });
  });

  function dateStr(daysAgo: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  }

  it("archives daily notes older than threshold", async () => {
    await fs.writeFile(path.join(memDir, `${dateStr(10)}.md`), "old note");
    await fs.writeFile(path.join(memDir, `${dateStr(1)}.md`), "recent note");

    const result = await runHygiene(memDir, { archiveAfterDays: 7 });

    expect(result.archived).toHaveLength(1);
    expect(result.archived[0]).toContain(dateStr(10));
    // Old file moved to archive.
    const archiveFiles = await fs.readdir(path.join(memDir, "archive"));
    expect(archiveFiles).toContain(`${dateStr(10)}.md`);
    // Recent file still in place.
    const mainFiles = await fs.readdir(memDir);
    expect(mainFiles).toContain(`${dateStr(1)}.md`);
  });

  it("purges archived files older than purge threshold", async () => {
    const archiveDir = path.join(memDir, "archive");
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.writeFile(path.join(archiveDir, `${dateStr(40)}.md`), "very old");
    await fs.writeFile(path.join(archiveDir, `${dateStr(10)}.md`), "recent archive");

    const result = await runHygiene(memDir, { purgeAfterDays: 30 });

    expect(result.purged).toHaveLength(1);
    expect(result.purged[0]).toContain(dateStr(40));
    // Recent archive still exists.
    const remaining = await fs.readdir(archiveDir);
    expect(remaining).toContain(`${dateStr(10)}.md`);
  });

  it("respects throttle — skips if run too recently", async () => {
    // First run should proceed.
    await fs.writeFile(path.join(memDir, `${dateStr(10)}.md`), "old");
    const first = await runHygiene(memDir, { archiveAfterDays: 7, throttleHours: 12 });
    expect(first.skippedThrottle).toBe(false);
    expect(first.archived).toHaveLength(1);

    // Second run should be throttled.
    await fs.writeFile(path.join(memDir, `${dateStr(15)}.md`), "another old");
    const second = await runHygiene(memDir, { archiveAfterDays: 7, throttleHours: 12 });
    expect(second.skippedThrottle).toBe(true);
    expect(second.archived).toHaveLength(0);
  });

  it("handles empty directory", async () => {
    const result = await runHygiene(memDir);
    expect(result.archived).toHaveLength(0);
    expect(result.purged).toHaveLength(0);
    expect(result.skippedThrottle).toBe(false);
  });

  it("ignores non-date files", async () => {
    await fs.writeFile(path.join(memDir, "MEMORY.md"), "important");
    await fs.writeFile(path.join(memDir, "state.md"), "state");

    const result = await runHygiene(memDir, { archiveAfterDays: 0 });

    expect(result.archived).toHaveLength(0);
    // Non-date files untouched.
    const files = await fs.readdir(memDir);
    expect(files).toContain("MEMORY.md");
    expect(files).toContain("state.md");
  });
});
