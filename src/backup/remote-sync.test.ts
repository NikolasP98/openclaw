import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _internals,
  detectChanges,
  fileChecksum,
  loadSyncState,
  saveSyncState,
  scanDirectory,
  shouldExclude,
} from "./remote-sync.js";

describe("fileChecksum", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp("/tmp/backup-test-");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns a 64-char hex hash", async () => {
    const file = path.join(tmpDir, "test.txt");
    await fs.writeFile(file, "hello world");
    const hash = await fileChecksum(file);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", async () => {
    const file = path.join(tmpDir, "test.txt");
    await fs.writeFile(file, "same content");
    expect(await fileChecksum(file)).toBe(await fileChecksum(file));
  });

  it("differs for different content", async () => {
    const f1 = path.join(tmpDir, "a.txt");
    const f2 = path.join(tmpDir, "b.txt");
    await fs.writeFile(f1, "content A");
    await fs.writeFile(f2, "content B");
    expect(await fileChecksum(f1)).not.toBe(await fileChecksum(f2));
  });
});

describe("shouldExclude", () => {
  it("matches exact paths", () => {
    expect(shouldExclude("node_modules", ["node_modules"])).toBe(true);
  });

  it("matches directory glob patterns", () => {
    expect(shouldExclude(".git/objects/abc", [".git/**"])).toBe(true);
    expect(shouldExclude(".git", [".git/**"])).toBe(true);
    expect(shouldExclude("src/index.ts", [".git/**"])).toBe(false);
  });

  it("matches extension patterns", () => {
    expect(shouldExclude("file.log", ["*.log"])).toBe(true);
    expect(shouldExclude("deep/nested/file.log", ["*.log"])).toBe(true);
    expect(shouldExclude("file.txt", ["*.log"])).toBe(false);
  });

  it("returns false when no patterns match", () => {
    expect(shouldExclude("src/main.ts", ["*.log", ".git/**"])).toBe(false);
  });

  it("handles empty patterns", () => {
    expect(shouldExclude("anything", [])).toBe(false);
  });
});

describe("scanDirectory", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp("/tmp/scan-test-");
    await fs.writeFile(path.join(tmpDir, "a.txt"), "aaa");
    await fs.mkdir(path.join(tmpDir, "sub"));
    await fs.writeFile(path.join(tmpDir, "sub", "b.txt"), "bbb");
    await fs.writeFile(path.join(tmpDir, "ignore.log"), "log");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns checksums for all files", async () => {
    const result = await scanDirectory(tmpDir);
    expect(Object.keys(result)).toContain("a.txt");
    expect(Object.keys(result)).toContain("sub/b.txt");
    expect(Object.keys(result)).toContain("ignore.log");
  });

  it("respects exclude patterns", async () => {
    const result = await scanDirectory(tmpDir, ["*.log"]);
    expect(Object.keys(result)).toContain("a.txt");
    expect(Object.keys(result)).not.toContain("ignore.log");
  });

  it("excludes directories", async () => {
    const result = await scanDirectory(tmpDir, ["sub/**"]);
    expect(Object.keys(result)).toContain("a.txt");
    expect(Object.keys(result)).not.toContain("sub/b.txt");
  });
});

describe("detectChanges", () => {
  it("detects added files", () => {
    const current = { "a.txt": "hash1", "b.txt": "hash2" };
    const previous = { "a.txt": "hash1" };
    const changes = detectChanges(current, previous);
    expect(changes.added).toEqual(["b.txt"]);
    expect(changes.modified).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it("detects modified files", () => {
    const current = { "a.txt": "newhash" };
    const previous = { "a.txt": "oldhash" };
    const changes = detectChanges(current, previous);
    expect(changes.modified).toEqual(["a.txt"]);
  });

  it("detects removed files", () => {
    const current = {};
    const previous = { "a.txt": "hash1" };
    const changes = detectChanges(current, previous);
    expect(changes.removed).toEqual(["a.txt"]);
  });

  it("returns empty for identical states", () => {
    const state = { "a.txt": "hash1" };
    const changes = detectChanges(state, state);
    expect(changes.added).toEqual([]);
    expect(changes.modified).toEqual([]);
    expect(changes.removed).toEqual([]);
  });

  it("handles empty states", () => {
    expect(detectChanges({}, {}).added).toEqual([]);
  });
});

describe("syncState persistence", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp("/tmp/sync-state-test-");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("saves and loads sync state", async () => {
    const stateFile = path.join(tmpDir, "state.json");
    const state = {
      lastSyncAt: "2025-01-01T00:00:00Z",
      checksums: { "a.txt": "abc123" },
    };

    await saveSyncState(stateFile, state);
    const loaded = await loadSyncState(stateFile);

    expect(loaded).toEqual(state);
  });

  it("returns null for missing state file", async () => {
    const result = await loadSyncState(path.join(tmpDir, "nonexistent.json"));
    expect(result).toBeNull();
  });

  it("creates parent directories", async () => {
    const stateFile = path.join(tmpDir, "nested", "deep", "state.json");
    await saveSyncState(stateFile, {
      lastSyncAt: new Date().toISOString(),
      checksums: {},
    });
    const loaded = await loadSyncState(stateFile);
    expect(loaded).not.toBeNull();
  });
});

describe("buildRcloneArgs", () => {
  it("builds basic sync args", () => {
    const args = _internals.buildRcloneArgs({
      remote: "r2:",
      localDir: "/data",
    });
    expect(args).toEqual(["sync", "/data", "r2:", "--progress"]);
  });

  it("includes remote path", () => {
    const args = _internals.buildRcloneArgs({
      remote: "s3:mybucket/",
      remotePath: "backups/",
      localDir: "/data",
    });
    expect(args[2]).toBe("s3:mybucket/backups/");
  });

  it("includes exclude patterns", () => {
    const args = _internals.buildRcloneArgs({
      remote: "r2:",
      localDir: "/data",
      exclude: ["*.log", ".git/**"],
    });
    expect(args).toContain("--exclude");
    expect(args[args.indexOf("--exclude") + 1]).toBe("*.log");
  });

  it("includes dry-run flag", () => {
    const args = _internals.buildRcloneArgs({
      remote: "r2:",
      localDir: "/data",
      dryRun: true,
    });
    expect(args).toContain("--dry-run");
  });

  it("includes extra flags", () => {
    const args = _internals.buildRcloneArgs({
      remote: "r2:",
      localDir: "/data",
      extraFlags: ["--transfers", "8"],
    });
    expect(args).toContain("--transfers");
    expect(args).toContain("8");
  });
});
