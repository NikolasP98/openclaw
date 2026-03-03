import { describe, expect, it } from "vitest";
import { checkCommandAutonomy } from "./autonomy-enforcement.js";
import type { MinionConfig } from "../config/config.js";

function makeConfig(level: "readonly" | "supervised" | "full"): MinionConfig {
  return { security: { level } } as MinionConfig;
}

describe("autonomy-enforcement", () => {
  describe("checkCommandAutonomy", () => {
    it("returns null for non-exec tools", () => {
      const result = checkCommandAutonomy({
        toolName: "memory_search",
        toolParams: { query: "test" },
        config: makeConfig("readonly"),
      });
      expect(result).toBeNull();
    });

    it("returns null for non-exec tools regardless of mode", () => {
      for (const tool of ["web_search", "cron", "browser_navigate", "sessions_spawn"]) {
        expect(
          checkCommandAutonomy({
            toolName: tool,
            toolParams: {},
            config: makeConfig("readonly"),
          }),
        ).toBeNull();
      }
    });

    describe("readonly mode", () => {
      const config = makeConfig("readonly");

      it("allows safe commands", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { command: "ls -la" },
          config,
        });
        expect(result).toEqual({ blocked: false });
      });

      it("blocks medium-risk commands", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { command: "npm install express" },
          config,
        });
        expect(result?.blocked).toBe(true);
      });

      it("blocks high-risk commands", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { command: "rm -rf /" },
          config,
        });
        expect(result?.blocked).toBe(true);
      });

      it("blocks when no command can be extracted", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { unknown: "field" },
          config,
        });
        expect(result?.blocked).toBe(true);
      });
    });

    describe("supervised mode", () => {
      const config = makeConfig("supervised");

      it("allows safe commands", () => {
        const result = checkCommandAutonomy({
          toolName: "shell",
          toolParams: { command: "cat README.md" },
          config,
        });
        expect(result).toEqual({ blocked: false });
      });

      it("blocks medium-risk commands (requires approval)", () => {
        const result = checkCommandAutonomy({
          toolName: "shell",
          toolParams: { command: "git push origin main" },
          config,
        });
        expect(result?.blocked).toBe(true);
        expect((result as { reason: string }).reason).toContain("supervised");
      });

      it("allows through when no command extracted (unlike readonly)", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { unknown: "field" },
          config,
        });
        expect(result).toEqual({ blocked: false });
      });
    });

    describe("full mode", () => {
      const config = makeConfig("full");

      it("allows everything", () => {
        for (const cmd of ["ls -la", "rm -rf /", "sudo shutdown -h now"]) {
          const result = checkCommandAutonomy({
            toolName: "exec",
            toolParams: { command: cmd },
            config,
          });
          expect(result).toEqual({ blocked: false });
        }
      });
    });

    describe("default (no config)", () => {
      it("defaults to full mode when security config is absent", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { command: "rm -rf /" },
          config: {} as MinionConfig,
        });
        expect(result).toEqual({ blocked: false });
      });

      it("defaults to full mode when config is undefined", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { command: "rm -rf /" },
          config: undefined,
        });
        expect(result).toEqual({ blocked: false });
      });
    });

    describe("tool name normalization", () => {
      it("handles shell_exec tool name", () => {
        const result = checkCommandAutonomy({
          toolName: "shell_exec",
          toolParams: { command: "rm -rf /" },
          config: makeConfig("readonly"),
        });
        expect(result?.blocked).toBe(true);
      });

      it("handles bash tool name", () => {
        const result = checkCommandAutonomy({
          toolName: "bash",
          toolParams: { command: "echo hello" },
          config: makeConfig("readonly"),
        });
        expect(result).toEqual({ blocked: false });
      });
    });

    describe("param extraction", () => {
      it("extracts from 'command' param key", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { command: "ls" },
          config: makeConfig("readonly"),
        });
        expect(result).toEqual({ blocked: false });
      });

      it("extracts from 'cmd' param key", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { cmd: "ls" },
          config: makeConfig("readonly"),
        });
        expect(result).toEqual({ blocked: false });
      });

      it("extracts from 'script' param key", () => {
        const result = checkCommandAutonomy({
          toolName: "exec",
          toolParams: { script: "rm -rf /" },
          config: makeConfig("readonly"),
        });
        expect(result?.blocked).toBe(true);
      });
    });
  });
});
