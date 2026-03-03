import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyProfile, deepMerge, listProfiles, loadProfile } from "./profile-loader.js";

describe("deepMerge", () => {
  it("merges flat objects", () => {
    expect(deepMerge({ a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 });
  });

  it("override wins on conflict", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  it("deep merges nested objects", () => {
    const result = deepMerge(
      { agents: { defaults: { model: "a", timeout: 30 } } },
      { agents: { defaults: { model: "b" } } },
    );
    expect(result).toEqual({
      agents: { defaults: { model: "b", timeout: 30 } },
    });
  });

  it("replaces arrays (no concatenation)", () => {
    expect(deepMerge({ tags: ["a"] }, { tags: ["b", "c"] })).toEqual({
      tags: ["b", "c"],
    });
  });

  it("handles empty objects", () => {
    expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
    expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
  });
});

describe("loadProfile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp("/tmp/profile-test-");
    await fs.writeFile(
      path.join(tmpDir, "lite.json"),
      JSON.stringify({
        $schema: "ignored",
        _description: "Test lite profile",
        logging: { level: "warn" },
        agents: { defaults: { maxConcurrent: 1 } },
      }),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loads a profile by name", async () => {
    const profile = await loadProfile("lite", tmpDir);
    expect(profile).not.toBeNull();
    expect(profile!.logging).toEqual({ level: "warn" });
  });

  it("strips $schema and _description", async () => {
    const profile = await loadProfile("lite", tmpDir);
    expect(profile).not.toHaveProperty("$schema");
    expect(profile).not.toHaveProperty("_description");
  });

  it("returns null for missing profile", async () => {
    expect(await loadProfile("nonexistent", tmpDir)).toBeNull();
  });

  it("sanitizes profile name (prevents path traversal)", async () => {
    expect(await loadProfile("../etc/passwd", tmpDir)).toBeNull();
  });
});

describe("applyProfile", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp("/tmp/profile-apply-test-");
    await fs.writeFile(
      path.join(tmpDir, "lite.json"),
      JSON.stringify({
        logging: { level: "warn" },
        agents: { defaults: { maxConcurrent: 1, contextTokens: 8192 } },
        browser: { enabled: false },
      }),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("merges profile as base with user config as override", async () => {
    const userConfig = {
      agents: { defaults: { maxConcurrent: 4 } },
    };

    const result = await applyProfile("lite", userConfig, tmpDir);

    // User override wins
    expect((result.agents as Record<string, unknown>).defaults).toEqual(
      expect.objectContaining({ maxConcurrent: 4 }),
    );
    // Profile value preserved where user didn't override
    expect((result.agents as Record<string, unknown>).defaults).toEqual(
      expect.objectContaining({ contextTokens: 8192 }),
    );
    // Profile-only values present
    expect(result.browser).toEqual({ enabled: false });
    expect(result.logging).toEqual({ level: "warn" });
  });

  it("returns user config unchanged for missing profile", async () => {
    const userConfig = { agents: { defaults: { maxConcurrent: 4 } } };
    const result = await applyProfile("nonexistent", userConfig, tmpDir);
    expect(result).toEqual(userConfig);
  });
});

describe("listProfiles", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp("/tmp/profile-list-test-");
    await fs.writeFile(path.join(tmpDir, "lite.json"), "{}");
    await fs.writeFile(path.join(tmpDir, "full.json"), "{}");
    await fs.writeFile(path.join(tmpDir, "readme.txt"), "not a profile");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("lists profile names sorted", async () => {
    const profiles = await listProfiles(tmpDir);
    expect(profiles).toEqual(["full", "lite"]);
  });

  it("returns empty for missing directory", async () => {
    expect(await listProfiles("/tmp/nonexistent-profiles-dir")).toEqual([]);
  });
});
