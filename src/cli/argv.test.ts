import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "minion", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "minion", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "minion", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "minion", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "minion", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "minion", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "minion", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "minion"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "minion", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "minion", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "minion", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "minion", "status", "--timeout=2500"], "--timeout")).toBe("2500");
    expect(getFlagValue(["node", "minion", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "minion", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "minion", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "minion", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "minion", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "minion", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "minion", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "minion", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "minion", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "minion", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["node", "minion", "status"],
    });
    expect(nodeArgv).toEqual(["node", "minion", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["node-22", "minion", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "minion", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["node-22.2.0.exe", "minion", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "minion", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["node-22.2", "minion", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "minion", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["node-22.2.exe", "minion", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "minion", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["/usr/bin/node-22.2.0", "minion", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "minion", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["nodejs", "minion", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "minion", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["node-dev", "minion", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "minion", "node-dev", "minion", "status"]);

    const directArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["minion", "status"],
    });
    expect(directArgv).toEqual(["node", "minion", "status"]);

    const bunArgv = buildParseArgv({
      programName: "minion",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "minion",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "minion", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "minion", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "config", "get", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "config", "unset", "update"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "models", "list"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "models", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "minion", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "minion", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["config", "get"])).toBe(false);
    expect(shouldMigrateStateFromPath(["models", "status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});
