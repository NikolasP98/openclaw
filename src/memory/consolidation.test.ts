import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consolidateMemory, shouldConsolidate } from "./consolidation.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join("/tmp", "consolidation-test-"));
  await fs.mkdir(path.join(tmpDir, "memory"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("shouldConsolidate", () => {
  it("returns false when disabled", async () => {
    const result = await shouldConsolidate({
      workspaceDir: tmpDir,
      config: { enabled: false },
    });
    expect(result).toEqual({ should: false, noteCount: 0 });
  });

  it("returns false when config is undefined", async () => {
    const result = await shouldConsolidate({
      workspaceDir: tmpDir,
    });
    expect(result).toEqual({ should: false, noteCount: 0 });
  });

  it("returns false when below threshold", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-01.md"), "note 1");
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-02.md"), "note 2");
    const result = await shouldConsolidate({
      workspaceDir: tmpDir,
      config: { enabled: true, fileThreshold: 5 },
    });
    expect(result).toEqual({ should: false, noteCount: 2 });
  });

  it("returns true when at threshold", async () => {
    for (let i = 1; i <= 3; i++) {
      await fs.writeFile(path.join(tmpDir, "memory", `2026-02-0${i}.md`), `note ${i}`);
    }
    const result = await shouldConsolidate({
      workspaceDir: tmpDir,
      config: { enabled: true, fileThreshold: 3 },
    });
    expect(result).toEqual({ should: true, noteCount: 3 });
  });

  it("ignores non-dated files", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "notes.md"), "not a daily note");
    await fs.writeFile(path.join(tmpDir, "memory", "README.md"), "readme");
    const result = await shouldConsolidate({
      workspaceDir: tmpDir,
      config: { enabled: true, fileThreshold: 1 },
    });
    expect(result).toEqual({ should: false, noteCount: 0 });
  });
});

describe("consolidateMemory", () => {
  const mockLlm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when no daily notes exist", async () => {
    const result = await consolidateMemory({
      workspaceDir: tmpDir,
      callLlm: mockLlm,
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("no daily notes");
  });

  it("skips when all notes are empty", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-01.md"), "  \n ");
    const result = await consolidateMemory({
      workspaceDir: tmpDir,
      callLlm: mockLlm,
    });
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("empty");
  });

  it("consolidates daily notes into MEMORY.md", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-01.md"), "Met with team.");
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-02.md"), "Fixed auth bug.");
    await fs.writeFile(path.join(tmpDir, "MEMORY.md"), "User likes TypeScript.");

    mockLlm.mockResolvedValueOnce(
      JSON.stringify({
        history_entry: "Team meeting on Feb 1. Auth bug fixed on Feb 2.",
        memory_update:
          "User likes TypeScript.\nTeam meeting held on Feb 1.\nAuth bug in gateway fixed on Feb 2.",
      }),
    );

    const result = await consolidateMemory({
      workspaceDir: tmpDir,
      callLlm: mockLlm,
    });

    expect(result.status).toBe("consolidated");
    expect(result.filesProcessed).toBe(2);

    // MEMORY.md should be updated
    const memoryContent = await fs.readFile(path.join(tmpDir, "MEMORY.md"), "utf-8");
    expect(memoryContent).toContain("Auth bug in gateway fixed");

    // Daily notes should be archived
    const archiveFiles = await fs.readdir(path.join(tmpDir, "memory", "archive"));
    expect(archiveFiles).toContain("2026-02-01.md");
    expect(archiveFiles).toContain("2026-02-02.md");

    // Daily notes should no longer exist in memory/
    const memoryFiles = await fs.readdir(path.join(tmpDir, "memory"));
    expect(memoryFiles).not.toContain("2026-02-01.md");
    expect(memoryFiles).not.toContain("2026-02-02.md");

    // History entry should exist
    const historyFiles = await fs.readdir(path.join(tmpDir, "memory", "history"));
    expect(historyFiles.length).toBe(1);
    const historyContent = await fs.readFile(
      path.join(tmpDir, "memory", "history", historyFiles[0]),
      "utf-8",
    );
    expect(historyContent).toContain("Team meeting on Feb 1");
  });

  it("handles LLM call failure", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-01.md"), "Some note.");
    mockLlm.mockRejectedValueOnce(new Error("API timeout"));

    const result = await consolidateMemory({
      workspaceDir: tmpDir,
      callLlm: mockLlm,
    });

    expect(result.status).toBe("error");
    expect(result.reason).toContain("LLM call failed");
  });

  it("handles malformed LLM response", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-01.md"), "Some note.");
    mockLlm.mockResolvedValueOnce("This is not JSON at all");

    const result = await consolidateMemory({
      workspaceDir: tmpDir,
      callLlm: mockLlm,
    });

    expect(result.status).toBe("error");
    expect(result.reason).toContain("parse");
  });

  it("handles LLM response with markdown fences", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-01.md"), "Some note.");
    mockLlm.mockResolvedValueOnce(
      '```json\n{"history_entry": "test", "memory_update": "updated"}\n```',
    );

    const result = await consolidateMemory({
      workspaceDir: tmpDir,
      callLlm: mockLlm,
    });

    expect(result.status).toBe("consolidated");
    const content = await fs.readFile(path.join(tmpDir, "MEMORY.md"), "utf-8");
    expect(content).toBe("updated");
  });

  it("creates MEMORY.md if it doesn't exist", async () => {
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-01.md"), "First note.");
    mockLlm.mockResolvedValueOnce(
      JSON.stringify({
        history_entry: "First day.",
        memory_update: "First note content.",
      }),
    );

    const result = await consolidateMemory({
      workspaceDir: tmpDir,
      callLlm: mockLlm,
    });

    expect(result.status).toBe("consolidated");
    const exists = await fs
      .access(path.join(tmpDir, "MEMORY.md"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });

  it("respects maxInputChars budget", async () => {
    // Create notes that exceed the budget
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-01.md"), "a".repeat(100));
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-02.md"), "b".repeat(100));
    await fs.writeFile(path.join(tmpDir, "memory", "2026-02-03.md"), "c".repeat(100));

    mockLlm.mockResolvedValueOnce(
      JSON.stringify({
        history_entry: "Partial consolidation.",
        memory_update: "Partial update.",
      }),
    );

    const result = await consolidateMemory({
      workspaceDir: tmpDir,
      config: { maxInputChars: 150 },
      callLlm: mockLlm,
    });

    expect(result.status).toBe("consolidated");
    // Should only have processed 1 file (100 chars) since 2nd would exceed 150
    expect(result.filesProcessed).toBe(1);
  });
});
