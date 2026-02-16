import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs(["node", "minion", "gateway", "--dev", "--allow-unconfigured"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "minion", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "minion", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "minion", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "minion", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "minion", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "minion", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "minion", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "minion", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join(path.resolve("/home/peter"), ".minion-dev");
    expect(env.MINION_PROFILE).toBe("dev");
    expect(env.MINION_STATE_DIR).toBe(expectedStateDir);
    expect(env.MINION_CONFIG_PATH).toBe(path.join(expectedStateDir, "minion.json"));
    expect(env.MINION_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      MINION_STATE_DIR: "/custom",
      MINION_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.MINION_STATE_DIR).toBe("/custom");
    expect(env.MINION_GATEWAY_PORT).toBe("19099");
    expect(env.MINION_CONFIG_PATH).toBe(path.join("/custom", "minion.json"));
  });

  it("uses MINION_HOME when deriving profile state dir", () => {
    const env: Record<string, string | undefined> = {
      MINION_HOME: "/srv/minion-home",
      HOME: "/home/other",
    };
    applyCliProfileEnv({
      profile: "work",
      env,
      homedir: () => "/home/fallback",
    });

    const resolvedHome = path.resolve("/srv/minion-home");
    expect(env.MINION_STATE_DIR).toBe(path.join(resolvedHome, ".minion-work"));
    expect(env.MINION_CONFIG_PATH).toBe(path.join(resolvedHome, ".minion-work", "minion.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("minion doctor --fix", {})).toBe("minion doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("minion doctor --fix", { MINION_PROFILE: "default" })).toBe(
      "minion doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("minion doctor --fix", { MINION_PROFILE: "Default" })).toBe(
      "minion doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("minion doctor --fix", { MINION_PROFILE: "bad profile" })).toBe(
      "minion doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(formatCliCommand("minion --profile work doctor --fix", { MINION_PROFILE: "work" })).toBe(
      "minion --profile work doctor --fix",
    );
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("minion --dev doctor", { MINION_PROFILE: "dev" })).toBe(
      "minion --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("minion doctor --fix", { MINION_PROFILE: "work" })).toBe(
      "minion --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("minion doctor --fix", { MINION_PROFILE: "  jbminion  " })).toBe(
      "minion --profile jbminion doctor --fix",
    );
  });

  it("handles command with no args after minion", () => {
    expect(formatCliCommand("minion", { MINION_PROFILE: "test" })).toBe("minion --profile test");
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm minion doctor", { MINION_PROFILE: "work" })).toBe(
      "pnpm minion --profile work doctor",
    );
  });
});
