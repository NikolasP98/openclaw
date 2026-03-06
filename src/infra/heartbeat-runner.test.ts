import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_PROMPT,
  DEFAULT_HEARTBEAT_EVERY,
  DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
} from "../auto-reply/heartbeat.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  resolveHeartbeatIntervalMs,
  isHeartbeatEnabledForAgent,
  resolveHeartbeatSummaryForAgent,
  resolveHeartbeatPrompt,
} from "./heartbeat-runner.js";

const emptyCfg: OpenClawConfig = {} as OpenClawConfig;

// ---------------------------------------------------------------------------
// resolveHeartbeatIntervalMs
// ---------------------------------------------------------------------------
describe("resolveHeartbeatIntervalMs", () => {
  it("parses '5m' to 300 000 ms", () => {
    expect(resolveHeartbeatIntervalMs(emptyCfg, "5m")).toBe(300_000);
  });

  it("parses '30s' to 30 000 ms", () => {
    expect(resolveHeartbeatIntervalMs(emptyCfg, "30s")).toBe(30_000);
  });

  it("parses '1h' to 3 600 000 ms", () => {
    expect(resolveHeartbeatIntervalMs(emptyCfg, "1h")).toBe(3_600_000);
  });

  it("returns null for '0' (disabled)", () => {
    expect(resolveHeartbeatIntervalMs(emptyCfg, "0")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveHeartbeatIntervalMs(emptyCfg, "")).toBeNull();
  });

  it("falls back to DEFAULT_HEARTBEAT_EVERY when no override and no config", () => {
    const ms = resolveHeartbeatIntervalMs(emptyCfg);
    expect(ms).toBeTypeOf("number");
    expect(ms).toBeGreaterThan(0);
  });

  it("uses heartbeat config every when no override is provided", () => {
    const ms = resolveHeartbeatIntervalMs(emptyCfg, undefined, { every: "10m" });
    expect(ms).toBe(600_000);
  });

  it("prefers overrideEvery over heartbeat config", () => {
    const ms = resolveHeartbeatIntervalMs(emptyCfg, "2m", { every: "10m" });
    expect(ms).toBe(120_000);
  });
});

// ---------------------------------------------------------------------------
// isHeartbeatEnabledForAgent
// ---------------------------------------------------------------------------
describe("isHeartbeatEnabledForAgent", () => {
  it("returns true for default agent when no agents list is configured", () => {
    expect(isHeartbeatEnabledForAgent(emptyCfg)).toBe(true);
  });

  it("returns true for a listed agent", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "alice" }] },
    } as OpenClawConfig;
    expect(isHeartbeatEnabledForAgent(cfg, "alice")).toBe(true);
  });

  it("returns false for an unlisted agent when agents list exists", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "alice" }] },
    } as OpenClawConfig;
    expect(isHeartbeatEnabledForAgent(cfg, "bob")).toBe(false);
  });

  it("normalizes agent id casing", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "Alice" }] },
    } as OpenClawConfig;
    expect(isHeartbeatEnabledForAgent(cfg, "alice")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveHeartbeatSummaryForAgent
// ---------------------------------------------------------------------------
describe("resolveHeartbeatSummaryForAgent", () => {
  it("returns enabled with defaults when no config is set", () => {
    const summary = resolveHeartbeatSummaryForAgent(emptyCfg);
    expect(summary.enabled).toBe(true);
    expect(summary.every).toBe(DEFAULT_HEARTBEAT_EVERY);
    expect(summary.everyMs).toBeTypeOf("number");
    expect(summary.everyMs).toBeGreaterThan(0);
    expect(summary.prompt).toBe(HEARTBEAT_PROMPT);
    expect(summary.target).toBe("last");
    expect(summary.ackMaxChars).toBe(DEFAULT_HEARTBEAT_ACK_MAX_CHARS);
  });

  it("returns disabled summary for an unlisted agent", () => {
    const cfg: OpenClawConfig = {
      agents: { list: [{ id: "alice" }] },
    } as OpenClawConfig;
    const summary = resolveHeartbeatSummaryForAgent(cfg, "bob");
    expect(summary.enabled).toBe(false);
    expect(summary.every).toBe("disabled");
    expect(summary.everyMs).toBeNull();
  });

  it("applies agent-specific heartbeat overrides", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: { heartbeat: { every: "10m", prompt: "default prompt" } },
        list: [{ id: "alice", heartbeat: { every: "2m", prompt: "alice prompt" } }],
      },
    } as OpenClawConfig;
    const summary = resolveHeartbeatSummaryForAgent(cfg, "alice");
    expect(summary.enabled).toBe(true);
    expect(summary.every).toBe("2m");
    expect(summary.everyMs).toBe(120_000);
    expect(summary.prompt).toBe("alice prompt");
  });

  it("includes model override when configured", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: { heartbeat: { model: "anthropic/claude-sonnet" } },
      },
    } as OpenClawConfig;
    const summary = resolveHeartbeatSummaryForAgent(cfg);
    expect(summary.model).toBe("anthropic/claude-sonnet");
  });
});

// ---------------------------------------------------------------------------
// resolveHeartbeatPrompt
// ---------------------------------------------------------------------------
describe("resolveHeartbeatPrompt", () => {
  it("returns default prompt when no config is set", () => {
    expect(resolveHeartbeatPrompt(emptyCfg)).toBe(HEARTBEAT_PROMPT);
  });

  it("returns custom prompt from heartbeat config", () => {
    const prompt = resolveHeartbeatPrompt(emptyCfg, { prompt: "Check tasks now." });
    expect(prompt).toBe("Check tasks now.");
  });

  it("falls back to defaults.heartbeat.prompt from config", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { heartbeat: { prompt: "global prompt" } } },
    } as OpenClawConfig;
    expect(resolveHeartbeatPrompt(cfg)).toBe("global prompt");
  });

  it("prefers heartbeat arg prompt over config default", () => {
    const cfg: OpenClawConfig = {
      agents: { defaults: { heartbeat: { prompt: "global prompt" } } },
    } as OpenClawConfig;
    expect(resolveHeartbeatPrompt(cfg, { prompt: "override" })).toBe("override");
  });
});
