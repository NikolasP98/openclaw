import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveGatewayStateDir } from "./paths.js";

describe("resolveGatewayStateDir", () => {
  it("uses the default state dir when no overrides are set", () => {
    const env = { HOME: "/Users/test" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".minion"));
  });

  it("appends the profile suffix when set", () => {
    const env = { HOME: "/Users/test", MINION_PROFILE: "rescue" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".minion-rescue"));
  });

  it("treats default profiles as the base state dir", () => {
    const env = { HOME: "/Users/test", MINION_PROFILE: "Default" };
    expect(resolveGatewayStateDir(env)).toBe(path.join("/Users/test", ".minion"));
  });

  it("uses MINION_STATE_DIR when provided", () => {
    const env = { HOME: "/Users/test", MINION_STATE_DIR: "/var/lib/minion" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/var/lib/minion"));
  });

  it("expands ~ in MINION_STATE_DIR", () => {
    const env = { HOME: "/Users/test", MINION_STATE_DIR: "~/minion-state" };
    expect(resolveGatewayStateDir(env)).toBe(path.resolve("/Users/test/minion-state"));
  });

  it("preserves Windows absolute paths without HOME", () => {
    const env = { MINION_STATE_DIR: "C:\\State\\minion" };
    expect(resolveGatewayStateDir(env)).toBe("C:\\State\\minion");
  });
});
