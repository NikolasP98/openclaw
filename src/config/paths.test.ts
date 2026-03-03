import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveDefaultConfigCandidates,
  resolveConfigPathCandidate,
  resolveConfigPath,
  resolveOAuthDir,
  resolveOAuthPath,
  resolveStateDir,
} from "./paths.js";

describe("oauth paths", () => {
  it("prefers MINION_OAUTH_DIR over MINION_STATE_DIR", () => {
    const env = {
      MINION_OAUTH_DIR: "/custom/oauth",
      MINION_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;

    expect(resolveOAuthDir(env, "/custom/state")).toBe(path.resolve("/custom/oauth"));
    expect(resolveOAuthPath(env, "/custom/state")).toBe(
      path.join(path.resolve("/custom/oauth"), "oauth.json"),
    );
  });

  it("derives oauth path from MINION_STATE_DIR when unset", () => {
    const env = {
      MINION_STATE_DIR: "/custom/state",
    } as NodeJS.ProcessEnv;

    expect(resolveOAuthDir(env, "/custom/state")).toBe(path.join("/custom/state", "credentials"));
    expect(resolveOAuthPath(env, "/custom/state")).toBe(
      path.join("/custom/state", "credentials", "oauth.json"),
    );
  });
});

describe("state + config path candidates", () => {
  it("uses MINION_STATE_DIR when set", () => {
    const env = {
      MINION_STATE_DIR: "/new/state",
    } as NodeJS.ProcessEnv;

    expect(resolveStateDir(env, () => "/home/test")).toBe(path.resolve("/new/state"));
  });

  it("uses MINION_HOME for default state/config locations", () => {
    const env = {
      MINION_HOME: "/srv/minion-home",
    } as NodeJS.ProcessEnv;

    const resolvedHome = path.resolve("/srv/minion-home");
    expect(resolveStateDir(env)).toBe(path.join(resolvedHome, ".minion"));

    const candidates = resolveDefaultConfigCandidates(env);
    expect(candidates[0]).toBe(path.join(resolvedHome, ".minion", "gateway.json"));
  });

  it("prefers MINION_HOME over HOME for default state/config locations", () => {
    const env = {
      MINION_HOME: "/srv/minion-home",
      HOME: "/home/other",
    } as NodeJS.ProcessEnv;

    const resolvedHome = path.resolve("/srv/minion-home");
    expect(resolveStateDir(env)).toBe(path.join(resolvedHome, ".minion"));

    const candidates = resolveDefaultConfigCandidates(env);
    expect(candidates[0]).toBe(path.join(resolvedHome, ".minion", "gateway.json"));
  });

  it("orders default config candidates in a stable order", () => {
    const home = "/home/test";
    const resolvedHome = path.resolve(home);
    const candidates = resolveDefaultConfigCandidates({} as NodeJS.ProcessEnv, () => home);
    const dirs = [".minion", ".openclaw", ".clawdbot", ".moldbot", ".moltbot"];
    const files = [
      "gateway.json",
      "minion.json",
      "openclaw.json",
      "clawdbot.json",
      "moldbot.json",
      "moltbot.json",
    ];
    const expected = dirs.flatMap((dir) => files.map((file) => path.join(resolvedHome, dir, file)));
    expect(candidates).toEqual(expected);
  });

  it("prefers ~/.minion when it exists and legacy dir is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "minion-state-"));
    try {
      const newDir = path.join(root, ".minion");
      await fs.mkdir(newDir, { recursive: true });
      const resolved = resolveStateDir({} as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(newDir);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("CONFIG_PATH prefers existing config when present", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "minion-config-"));
    try {
      const legacyDir = path.join(root, ".minion");
      await fs.mkdir(legacyDir, { recursive: true });
      const legacyPath = path.join(legacyDir, "minion.json");
      await fs.writeFile(legacyPath, "{}", "utf-8");

      const resolved = resolveConfigPathCandidate({} as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(legacyPath);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("respects state dir overrides when config is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "minion-config-override-"));
    try {
      const legacyDir = path.join(root, ".minion");
      await fs.mkdir(legacyDir, { recursive: true });
      const legacyConfig = path.join(legacyDir, "minion.json");
      await fs.writeFile(legacyConfig, "{}", "utf-8");

      const overrideDir = path.join(root, "override");
      const env = { MINION_STATE_DIR: overrideDir } as NodeJS.ProcessEnv;
      const resolved = resolveConfigPath(env, overrideDir, () => root);
      expect(resolved).toBe(path.join(overrideDir, "gateway.json"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
