import { describe, expect, it } from "vitest";
import { getPreset, isToolAllowedByPreset, listPresets, presetToPolicy } from "./tool-policy-presets.js";

describe("tool-policy-presets", () => {
  describe("getPreset", () => {
    it("returns analysis preset", () => {
      const preset = getPreset("analysis");
      expect(preset).toBeDefined();
      expect(preset!.name).toBe("analysis");
      expect(preset!.deny).toContain("write");
      expect(preset!.deny).toContain("exec");
    });

    it("returns developer preset", () => {
      const preset = getPreset("developer");
      expect(preset).toBeDefined();
      expect(preset!.allow).toContain("exec");
      expect(preset!.deny).toContain("gateway");
    });

    it("returns verification preset", () => {
      const preset = getPreset("verification");
      expect(preset).toBeDefined();
      expect(preset!.allow).toContain("exec"); // For running tests.
      expect(preset!.deny).toContain("write"); // Can't write code.
    });

    it("returns full preset with empty allow/deny", () => {
      const preset = getPreset("full");
      expect(preset).toBeDefined();
      expect(preset!.allow).toHaveLength(0);
      expect(preset!.deny).toHaveLength(0);
    });

    it("returns undefined for unknown presets", () => {
      expect(getPreset("unknown")).toBeUndefined();
    });
  });

  describe("listPresets", () => {
    it("returns all 4 preset names", () => {
      const names = listPresets();
      expect(names).toHaveLength(4);
      expect(names).toContain("analysis");
      expect(names).toContain("developer");
      expect(names).toContain("verification");
      expect(names).toContain("full");
    });
  });

  describe("isToolAllowedByPreset", () => {
    it("analysis: allows read, blocks write", () => {
      const preset = getPreset("analysis")!;
      expect(isToolAllowedByPreset("read", preset)).toBe(true);
      expect(isToolAllowedByPreset("grep", preset)).toBe(true);
      expect(isToolAllowedByPreset("write", preset)).toBe(false);
      expect(isToolAllowedByPreset("exec", preset)).toBe(false);
    });

    it("developer: allows exec, blocks gateway", () => {
      const preset = getPreset("developer")!;
      expect(isToolAllowedByPreset("exec", preset)).toBe(true);
      expect(isToolAllowedByPreset("write", preset)).toBe(true);
      expect(isToolAllowedByPreset("gateway", preset)).toBe(false);
      expect(isToolAllowedByPreset("sessions_spawn", preset)).toBe(false);
    });

    it("verification: allows exec (for tests), blocks write", () => {
      const preset = getPreset("verification")!;
      expect(isToolAllowedByPreset("exec", preset)).toBe(true);
      expect(isToolAllowedByPreset("read", preset)).toBe(true);
      expect(isToolAllowedByPreset("write", preset)).toBe(false);
      expect(isToolAllowedByPreset("edit", preset)).toBe(false);
    });

    it("full: allows everything", () => {
      const preset = getPreset("full")!;
      expect(isToolAllowedByPreset("exec", preset)).toBe(true);
      expect(isToolAllowedByPreset("gateway", preset)).toBe(true);
      expect(isToolAllowedByPreset("anything", preset)).toBe(true);
    });
  });

  describe("presetToPolicy", () => {
    it("converts preset to { allow, deny } object", () => {
      const preset = getPreset("analysis")!;
      const policy = presetToPolicy(preset);
      expect(policy.allow).toEqual(preset.allow);
      expect(policy.deny).toEqual(preset.deny);
    });
  });
});
