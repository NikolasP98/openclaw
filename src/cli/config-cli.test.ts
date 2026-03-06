import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigFileSnapshot, OpenClawConfig } from "../config/types.js";

/**
 * Test for issue #6070:
 * `openclaw config set/unset` must update snapshot.resolved (user config after $include/${ENV},
 * but before runtime defaults), so runtime defaults don't leak into the written config.
 */

const mockReadConfigFileSnapshot = vi.fn<() => Promise<ConfigFileSnapshot>>();
const mockWriteConfigFile = vi.fn<(cfg: OpenClawConfig) => Promise<void>>(async () => {});

vi.mock("../config/config.js", () => ({
  readConfigFileSnapshot: () => mockReadConfigFileSnapshot(),
  writeConfigFile: (cfg: OpenClawConfig) => mockWriteConfigFile(cfg),
}));

const mockLog = vi.fn();
const mockError = vi.fn();
const mockExit = vi.fn((code: number) => {
  const errorMessages = mockError.mock.calls.map((c) => c.join(" ")).join("; ");
  throw new Error(`__exit__:${code} - ${errorMessages}`);
});

vi.mock("../runtime.js", () => ({
  defaultRuntime: {
    log: (...args: unknown[]) => mockLog(...args),
    error: (...args: unknown[]) => mockError(...args),
    exit: (code: number) => mockExit(code),
  },
}));

function buildSnapshot(params: {
  resolved: OpenClawConfig;
  config: OpenClawConfig;
}): ConfigFileSnapshot {
  return {
    path: "/tmp/openclaw.json",
    exists: true,
    raw: JSON.stringify(params.resolved),
    parsed: params.resolved,
    resolved: params.resolved,
    valid: true,
    config: params.config,
    issues: [],
    warnings: [],
    legacyIssues: [],
  };
}

function setSnapshot(resolved: OpenClawConfig, config: OpenClawConfig) {
  mockReadConfigFileSnapshot.mockResolvedValueOnce(buildSnapshot({ resolved, config }));
}

async function runConfigCommand(args: string[]) {
  const { registerConfigCli } = await import("./config-cli.js");
  const program = new Command();
  program.exitOverride();
  registerConfigCli(program);
  await program.parseAsync(args, { from: "user" });
}

describe("config cli", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("config set - issue #6070", () => {
    it("preserves existing config keys when setting a new value", async () => {
      const resolved: OpenClawConfig = {
        agents: {
          list: [{ id: "main" }, { id: "oracle", workspace: "~/oracle-workspace" }],
        },
        gateway: { port: 18789 },
        tools: { allow: ["group:fs"] },
        logging: { level: "debug" },
      };
      const runtimeMerged: OpenClawConfig = {
        ...resolved,
        agents: {
          ...resolved.agents,
          defaults: {
            model: "gpt-5.2",
          } as never,
        } as never,
      };
      setSnapshot(resolved, runtimeMerged);

      await runConfigCommand(["config", "set", "gateway.auth.mode", "token"]);

      expect(mockWriteConfigFile).toHaveBeenCalledTimes(1);
      const written = mockWriteConfigFile.mock.calls[0]?.[0];
      expect(written.gateway?.auth).toEqual({ mode: "token" });
      expect(written.gateway?.port).toBe(18789);
      expect(written.agents).toEqual(resolved.agents);
      expect(written.tools).toEqual(resolved.tools);
      expect(written.logging).toEqual(resolved.logging);
      expect(written.agents).not.toHaveProperty("defaults");
    });

    it("does not inject runtime defaults into the written config", async () => {
      const resolved: OpenClawConfig = {
        gateway: { port: 18789 },
      };
      const runtimeMerged = {
        ...resolved,
        agents: {
          defaults: {
            model: "gpt-5.2",
            contextWindow: 128_000,
            maxTokens: 16_000,
          },
        } as never,
        messages: { ackReaction: "✅" } as never,
        sessions: { persistence: { enabled: true } } as never,
      } as unknown as OpenClawConfig;
      setSnapshot(resolved, runtimeMerged);

      await runConfigCommand(["config", "set", "gateway.auth.mode", "token"]);

      expect(mockWriteConfigFile).toHaveBeenCalledTimes(1);
      const written = mockWriteConfigFile.mock.calls[0]?.[0];
      expect(written).not.toHaveProperty("agents.defaults.model");
      expect(written).not.toHaveProperty("agents.defaults.contextWindow");
      expect(written).not.toHaveProperty("agents.defaults.maxTokens");
      expect(written).not.toHaveProperty("messages.ackReaction");
      expect(written).not.toHaveProperty("sessions.persistence");
      expect(written.gateway?.port).toBe(18789);
      expect(written.gateway?.auth).toEqual({ mode: "token" });
    });
  });

  describe("config unset - issue #6070", () => {
    it("preserves existing config keys when unsetting a value", async () => {
      const resolved: OpenClawConfig = {
        agents: { list: [{ id: "main" }] },
        gateway: { port: 18789 },
        tools: {
          profile: "coding",
          alsoAllow: ["agents_list"],
        },
        logging: { level: "debug" },
      };
      const runtimeMerged: OpenClawConfig = {
        ...resolved,
        agents: {
          ...resolved.agents,
          defaults: {
            model: "gpt-5.2",
          },
        } as never,
      };
      setSnapshot(resolved, runtimeMerged);

      await runConfigCommand(["config", "unset", "tools.alsoAllow"]);

      expect(mockWriteConfigFile).toHaveBeenCalledTimes(1);
      const written = mockWriteConfigFile.mock.calls[0]?.[0];
      expect(written.tools).not.toHaveProperty("alsoAllow");
      expect(written.agents).not.toHaveProperty("defaults");
      expect(written.agents?.list).toEqual(resolved.agents?.list);
      expect(written.gateway).toEqual(resolved.gateway);
      expect(written.tools?.profile).toBe("coding");
      expect(written.logging).toEqual(resolved.logging);
    });
  });

  describe("config validate", () => {
    it("reports success for a valid config", async () => {
      const resolved: OpenClawConfig = { gateway: { port: 18789 } };
      mockReadConfigFileSnapshot.mockResolvedValueOnce(
        buildSnapshot({ resolved, config: resolved }),
      );

      await runConfigCommand(["config", "validate"]);

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Config valid"));
    });

    it("exits 1 for an invalid config", async () => {
      mockReadConfigFileSnapshot.mockResolvedValueOnce({
        path: "/tmp/openclaw.json",
        exists: true,
        raw: "{}",
        parsed: {},
        resolved: {} as OpenClawConfig,
        valid: false,
        config: {} as OpenClawConfig,
        issues: [{ path: "gateway.port", message: "Expected number" }],
        warnings: [],
        legacyIssues: [],
      });

      await expect(runConfigCommand(["config", "validate"])).rejects.toThrow("__exit__:1");
      expect(mockError).toHaveBeenCalledWith(expect.stringContaining("Config invalid"));
    });

    it("outputs JSON when --json flag is used with valid config", async () => {
      const resolved: OpenClawConfig = { gateway: { port: 18789 } };
      mockReadConfigFileSnapshot.mockResolvedValueOnce(
        buildSnapshot({ resolved, config: resolved }),
      );

      await runConfigCommand(["config", "validate", "--json"]);

      const jsonCall = mockLog.mock.calls.find((c) => {
        try {
          JSON.parse(c[0]);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(jsonCall![0]);
      expect(parsed.valid).toBe(true);
    });

    it("outputs JSON when --json flag is used with invalid config", async () => {
      mockReadConfigFileSnapshot.mockResolvedValueOnce({
        path: "/tmp/openclaw.json",
        exists: true,
        raw: "{}",
        parsed: {},
        resolved: {} as OpenClawConfig,
        valid: false,
        config: {} as OpenClawConfig,
        issues: [{ path: "gateway.port", message: "Expected number" }],
        warnings: [],
        legacyIssues: [],
      });

      await expect(runConfigCommand(["config", "validate", "--json"])).rejects.toThrow(
        "__exit__:1",
      );
      const jsonCall = mockLog.mock.calls.find((c) => {
        try {
          JSON.parse(c[0]);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      const parsed = JSON.parse(jsonCall![0]);
      expect(parsed.valid).toBe(false);
      expect(parsed.issues).toHaveLength(1);
    });

    it("exits 1 when no config file exists", async () => {
      mockReadConfigFileSnapshot.mockResolvedValueOnce({
        path: "",
        exists: false,
        raw: null,
        parsed: null,
        resolved: {} as OpenClawConfig,
        valid: false,
        config: {} as OpenClawConfig,
        issues: [],
        warnings: [],
        legacyIssues: [],
      });

      await expect(runConfigCommand(["config", "validate"])).rejects.toThrow("__exit__:1");
    });

    it("shows warnings for valid config with warnings", async () => {
      mockReadConfigFileSnapshot.mockResolvedValueOnce({
        path: "/tmp/openclaw.json",
        exists: true,
        raw: "{}",
        parsed: {},
        resolved: {} as OpenClawConfig,
        valid: true,
        config: {} as OpenClawConfig,
        issues: [],
        warnings: [{ path: "agents.list[0]", message: "Missing model" }],
        legacyIssues: [],
      });

      await runConfigCommand(["config", "validate"]);

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Config valid"));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Missing model"));
    });
  });

  describe("config set --dry-run", () => {
    it("validates without writing when --dry-run is used", async () => {
      const resolved: OpenClawConfig = { gateway: { port: 18789 } };
      setSnapshot(resolved, resolved);

      await runConfigCommand(["config", "set", "--dry-run", "gateway.auth.mode", "token"]);

      expect(mockWriteConfigFile).not.toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Dry run"));
    });
  });
});
