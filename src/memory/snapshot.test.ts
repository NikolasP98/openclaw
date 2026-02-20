import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportSnapshot, hydrateFromSnapshot } from "./snapshot.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join("/tmp", "snapshot-test-"));
  await fs.mkdir(path.join(tmpDir, "memory"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("exportSnapshot", () => {
  it("skips when no memory content exists", async () => {
    const result = await exportSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("no memory content");
  });

  it("exports core files into snapshot", async () => {
    await fs.writeFile(path.join(tmpDir, "SOUL.md"), "I am a helpful assistant.");
    await fs.writeFile(path.join(tmpDir, "USER.md"), "User prefers dark mode.");
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "User's name is Nikolas.");

    const result = await exportSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("exported");
    expect(result.path).toContain("MEMORY_SNAPSHOT.md");

    const content = await fs.readFile(result.path!, "utf-8");
    expect(content).toContain("# Memory Snapshot");
    expect(content).toContain("## SOUL");
    expect(content).toContain("I am a helpful assistant.");
    expect(content).toContain("## USER");
    expect(content).toContain("User prefers dark mode.");
    expect(content).toContain("## MEMORY");
    expect(content).toContain("User's name is Nikolas.");
  });

  it("includes recent daily notes", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "Core memory.");
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-18.md"), "Day 1 notes.");
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-19.md"), "Day 2 notes.");

    const result = await exportSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("exported");

    const content = await fs.readFile(result.path!, "utf-8");
    expect(content).toContain("## Recent Daily Notes");
    expect(content).toContain("### 2026-02-18.md");
    expect(content).toContain("Day 1 notes.");
    expect(content).toContain("### 2026-02-19.md");
  });

  it("limits daily notes to recentDays", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "Core.");
    for (let i = 1; i <= 10; i++) {
      const day = String(i).padStart(2, "0");
      await fs.writeFile(path.join(tmpDir, "memory", `2026-02-${day}.md`), `Day ${i}.`);
    }

    const result = await exportSnapshot({
      workspaceDir: tmpDir,
      config: { recentDays: 3 },
    });
    expect(result.status).toBe("exported");

    const content = await fs.readFile(result.path!, "utf-8");
    // Should only have the last 3 days
    expect(content).toContain("2026-02-08.md");
    expect(content).toContain("2026-02-09.md");
    expect(content).toContain("2026-02-10.md");
    expect(content).not.toContain("2026-02-01.md");
  });

  it("skips empty core files", async () => {
    await fs.writeFile(path.join(tmpDir, "SOUL.md"), "");
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "Only memory has content.");

    const result = await exportSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("exported");

    const content = await fs.readFile(result.path!, "utf-8");
    expect(content).not.toContain("## SOUL");
    expect(content).toContain("## MEMORY");
  });
});

describe("hydrateFromSnapshot", () => {
  it("skips when no snapshot file exists", async () => {
    const result = await hydrateFromSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("no snapshot file");
  });

  it("skips when all core files already exist", async () => {
    await fs.writeFile(path.join(tmpDir, "SOUL.md"), "soul");
    await fs.writeFile(path.join(tmpDir, "USER.md"), "user");
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "memory");
    await fs.writeFile(
      path.join(tmpDir, "MEMORY_SNAPSHOT.md"),
      "## SOUL\nOld soul\n## USER\nOld user\n## MEMORY\nOld memory",
    );

    const result = await hydrateFromSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("already exist");

    // Existing files should NOT be overwritten
    const soul = await fs.readFile(path.join(tmpDir, "SOUL.md"), "utf-8");
    expect(soul).toBe("soul");
  });

  it("restores missing files from snapshot", async () => {
    await fs.writeFile(path.join(tmpDir, "SOUL.md"), "existing soul"); // Already exists
    // USER.md and MEMORY.md are missing
    await fs.writeFile(
      path.join(tmpDir, "MEMORY_SNAPSHOT.md"),
      [
        "# Memory Snapshot",
        "> Exported: 2026-02-20T10:00:00Z",
        "",
        "## SOUL",
        "Snapshot soul content",
        "",
        "## USER",
        "Snapshot user preferences",
        "",
        "## MEMORY",
        "Snapshot memory facts",
      ].join("\n"),
    );

    const result = await hydrateFromSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("hydrated");
    expect(result.restoredFiles).toContain("USER.md");
    expect(result.restoredFiles).toContain("MEMORY.md");
    expect(result.restoredFiles).not.toContain("SOUL.md"); // Already existed

    // Existing SOUL.md should NOT be overwritten
    const soul = await fs.readFile(path.join(tmpDir, "SOUL.md"), "utf-8");
    expect(soul).toBe("existing soul");

    // Missing files should be restored
    const user = await fs.readFile(path.join(tmpDir, "USER.md"), "utf-8");
    expect(user).toBe("Snapshot user preferences");

    const memory = await fs.readFile(path.join(tmpDir, "MEMORY.md"), "utf-8");
    expect(memory).toBe("Snapshot memory facts");
  });

  it("handles empty snapshot", async () => {
    await fs.writeFile(path.join(tmpDir, "MEMORY_SNAPSHOT.md"), "");
    const result = await hydrateFromSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("empty");
  });

  it("handles snapshot with missing sections for needed files", async () => {
    // MEMORY.md is missing, but snapshot only has SOUL section
    await fs.writeFile(path.join(tmpDir, "SOUL.md"), "soul");
    await fs.writeFile(path.join(tmpDir, "USER.md"), "user");
    await fs.writeFile(path.join(tmpDir, "MEMORY_SNAPSHOT.md"), "## SOUL\nSoul content only");

    const result = await hydrateFromSnapshot({ workspaceDir: tmpDir });
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("no data for missing files");
  });

  it("full round-trip: export then hydrate", async () => {
    // Setup original files
    await fs.writeFile(path.join(tmpDir, "SOUL.md"), "Original soul.");
    await fs.writeFile(path.join(tmpDir, "USER.md"), "Original user.");
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "Original memory.");

    // Export
    const exportResult = await exportSnapshot({ workspaceDir: tmpDir });
    expect(exportResult.status).toBe("exported");

    // Delete core files (simulate reinstall)
    await fs.unlink(path.join(tmpDir, "SOUL.md"));
    await fs.unlink(path.join(tmpDir, "USER.md"));
    await fs.unlink(path.join(tmpDir, "MEMORY.md"));

    // Hydrate
    const hydrateResult = await hydrateFromSnapshot({ workspaceDir: tmpDir });
    expect(hydrateResult.status).toBe("hydrated");
    expect(hydrateResult.restoredFiles).toEqual(["SOUL.md", "USER.md", "MEMORY.md"]);

    // Verify restored content matches originals
    const soul = await fs.readFile(path.join(tmpDir, "SOUL.md"), "utf-8");
    expect(soul).toBe("Original soul.");
    const user = await fs.readFile(path.join(tmpDir, "USER.md"), "utf-8");
    expect(user).toBe("Original user.");
    const memory = await fs.readFile(path.join(tmpDir, "MEMORY.md"), "utf-8");
    expect(memory).toBe("Original memory.");
  });
});
