import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome } from "./home-env.test-harness.js";
import { clearConfigCache, createConfigIO, loadConfig, parseConfigJson5 } from "./io.js";

const silentLogger = {
  warn: () => {},
  error: () => {},
};

// ---------------------------------------------------------------------------
// 1. parseConfigJson5
// ---------------------------------------------------------------------------
describe("parseConfigJson5", () => {
  it("parses valid JSON", () => {
    const result = parseConfigJson5('{"gateway":{"port":18789}}');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.parsed).toEqual({ gateway: { port: 18789 } });
    }
  });

  it("parses valid JSON5 (trailing commas, comments)", () => {
    const json5 = `{
      // server config
      gateway: {
        port: 18789,
      },
    }`;
    const result = parseConfigJson5(json5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.parsed as Record<string, unknown>).gateway).toEqual({ port: 18789 });
    }
  });

  it("returns error for invalid input", () => {
    const result = parseConfigJson5("{not valid json at all!!!");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeTypeOf("string");
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Round-trip with comment preservation
// ---------------------------------------------------------------------------
describe("config round-trip with comment preservation", () => {
  it("preserves data integrity through write-read-modify-write cycle", async () => {
    await withTempHome("openclaw-io-roundtrip-", async (home) => {
      const configDir = path.join(home, ".openclaw");
      const configPath = path.join(configDir, "openclaw.json");
      await fs.mkdir(configDir, { recursive: true });

      const makeIo = () =>
        createConfigIO({
          env: {} as NodeJS.ProcessEnv,
          homedir: () => home,
          configPath,
          logger: silentLogger,
        });

      // First write: establish the config file with meta stamp via IO
      const io1 = makeIo();
      await io1.writeConfigFile({ gateway: { port: 18789 } });

      // Re-create IO, read, modify, write again
      const io2 = makeIo();
      const snapshot = await io2.readConfigFileSnapshot();
      expect(snapshot.valid).toBe(true);
      expect(snapshot.config.gateway?.port).toBe(18789);

      const next = structuredClone(snapshot.config);
      next.gateway = { ...next.gateway, port: 28789 };
      await io2.writeConfigFile(next);

      // Read the raw file and verify data round-tripped correctly
      const written = await fs.readFile(configPath, "utf-8");
      const parsed = JSON.parse(written) as Record<string, unknown>;
      expect((parsed.gateway as Record<string, unknown>).port).toBe(28789);
      // Meta stamp should be updated
      expect(parsed.meta).toBeDefined();
      expect((parsed.meta as Record<string, unknown>).lastTouchedVersion).toBeTypeOf("string");
    });
  });

  it("lower-level comment-json preserves comments via parse/assign/stringify", async () => {
    // Test that comment-json itself can round-trip comments (outside writeConfigFile)
    const { parse, stringify, assign } = await import("comment-json");

    const raw = [
      "{",
      "  // Main gateway settings",
      '  "gateway": {',
      '    "port": 18789',
      "  }",
      "}",
    ].join("\n");

    const parsed = parse(raw);
    const target = assign({ meta: { v: "1" } }, parsed);
    (target as Record<string, Record<string, unknown>>).gateway.port = 28789;
    const output = stringify(target, null, 2);

    expect(output).toContain("// Main gateway settings");
    expect(output).toContain("28789");
  });
});

// ---------------------------------------------------------------------------
// 3. readConfigFileSnapshot
// ---------------------------------------------------------------------------
describe("readConfigFileSnapshot", () => {
  it("returns a valid snapshot for a well-formed config", async () => {
    await withTempHome("openclaw-io-snapshot-", async (home) => {
      const configDir = path.join(home, ".openclaw");
      const configPath = path.join(configDir, "openclaw.json");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ gateway: { port: 18789 } }, null, 2),
        "utf-8",
      );

      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
        logger: silentLogger,
      });
      const snapshot = await io.readConfigFileSnapshot();

      expect(snapshot.valid).toBe(true);
      expect(snapshot.exists).toBe(true);
      expect(snapshot.path).toBe(configPath);
      expect(snapshot.issues).toHaveLength(0);
      expect(snapshot.config.gateway?.port).toBe(18789);
      expect(snapshot.raw).toBeTypeOf("string");
      expect(snapshot.hash).toBeTypeOf("string");
      expect(snapshot.hash.length).toBeGreaterThan(0);
    });
  });

  it("returns an invalid snapshot with issues for broken JSON", async () => {
    await withTempHome("openclaw-io-snapshot-bad-", async (home) => {
      const configDir = path.join(home, ".openclaw");
      const configPath = path.join(configDir, "openclaw.json");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(configPath, "{ this is not valid json !!!", "utf-8");

      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
        logger: silentLogger,
      });
      const snapshot = await io.readConfigFileSnapshot();

      expect(snapshot.valid).toBe(false);
      expect(snapshot.exists).toBe(true);
      expect(snapshot.issues.length).toBeGreaterThan(0);
      expect(snapshot.issues[0].message).toContain("parse failed");
    });
  });

  it("returns a valid empty snapshot when config file does not exist", async () => {
    await withTempHome("openclaw-io-snapshot-missing-", async (home) => {
      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
        logger: silentLogger,
      });
      const snapshot = await io.readConfigFileSnapshot();

      expect(snapshot.valid).toBe(true);
      expect(snapshot.exists).toBe(false);
      expect(snapshot.issues).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Missing env var throws MissingEnvVarError
// ---------------------------------------------------------------------------
describe("missing env var", () => {
  it("${UNDEFINED_VAR} in config causes readConfigFileSnapshot to report an error", async () => {
    await withTempHome("openclaw-io-envvar-", async (home) => {
      const configDir = path.join(home, ".openclaw");
      const configPath = path.join(configDir, "openclaw.json");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({
          agents: {
            defaults: {
              cliBackends: {
                codex: {
                  command: "codex",
                  env: { OPENAI_API_KEY: "${UNDEFINED_VAR}" },
                },
              },
            },
          },
        }),
        "utf-8",
      );

      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
        logger: silentLogger,
      });
      const snapshot = await io.readConfigFileSnapshot();

      expect(snapshot.valid).toBe(false);
      expect(snapshot.issues.length).toBeGreaterThan(0);
      expect(snapshot.issues[0].message).toContain("UNDEFINED_VAR");
    });
  });

  it("loadConfig on instance level returns empty config for missing env var", async () => {
    await withTempHome("openclaw-io-envvar-load-", async (home) => {
      const configDir = path.join(home, ".openclaw");
      const configPath = path.join(configDir, "openclaw.json");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({
          gateway: { auth: { token: "${MISSING_TOKEN_VAR}" } },
        }),
        "utf-8",
      );

      const errorFn = vi.fn();
      const io = createConfigIO({
        env: {} as NodeJS.ProcessEnv,
        homedir: () => home,
        logger: { warn: () => {}, error: errorFn },
      });

      // loadConfig swallows the error and returns {} for invalid configs
      const config = io.loadConfig();
      expect(config).toEqual({});
      expect(errorFn).toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// 5. Config cache — loadConfig returns cached value within TTL
// ---------------------------------------------------------------------------
describe("config cache", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    clearConfigCache();
    savedEnv = {
      OPENCLAW_CONFIG_PATH: process.env.OPENCLAW_CONFIG_PATH,
      OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR,
      OPENCLAW_CONFIG_CACHE_MS: process.env.OPENCLAW_CONFIG_CACHE_MS,
      OPENCLAW_DISABLE_CONFIG_CACHE: process.env.OPENCLAW_DISABLE_CONFIG_CACHE,
      HOME: process.env.HOME,
      USERPROFILE: process.env.USERPROFILE,
    };
  });

  afterEach(() => {
    clearConfigCache();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns cached config within TTL and fresh config after clearConfigCache", async () => {
    await withTempHome("openclaw-io-cache-", async (home) => {
      const configDir = path.join(home, ".openclaw");
      const configPath = path.join(configDir, "openclaw.json");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ gateway: { port: 11111 } }, null, 2),
        "utf-8",
      );

      // Point the module-level loadConfig at our temp config
      process.env.OPENCLAW_CONFIG_PATH = configPath;
      process.env.OPENCLAW_CONFIG_CACHE_MS = "5000"; // long TTL
      delete process.env.OPENCLAW_DISABLE_CONFIG_CACHE;

      const config1 = loadConfig();
      expect(config1.gateway?.port).toBe(11111);

      // Modify the file on disk
      await fs.writeFile(
        configPath,
        JSON.stringify({ gateway: { port: 22222 } }, null, 2),
        "utf-8",
      );

      // Should still get cached value (TTL hasn't expired)
      const config2 = loadConfig();
      expect(config2.gateway?.port).toBe(11111);

      // After clearing cache, should pick up new value
      clearConfigCache();
      const config3 = loadConfig();
      expect(config3.gateway?.port).toBe(22222);
    });
  });

  it("does not cache when OPENCLAW_DISABLE_CONFIG_CACHE is set", async () => {
    await withTempHome("openclaw-io-nocache-", async (home) => {
      const configDir = path.join(home, ".openclaw");
      const configPath = path.join(configDir, "openclaw.json");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({ gateway: { port: 33333 } }, null, 2),
        "utf-8",
      );

      process.env.OPENCLAW_CONFIG_PATH = configPath;
      process.env.OPENCLAW_DISABLE_CONFIG_CACHE = "1";

      const config1 = loadConfig();
      expect(config1.gateway?.port).toBe(33333);

      await fs.writeFile(
        configPath,
        JSON.stringify({ gateway: { port: 44444 } }, null, 2),
        "utf-8",
      );

      // Without cache, should pick up the new value immediately
      const config2 = loadConfig();
      expect(config2.gateway?.port).toBe(44444);
    });
  });
});
