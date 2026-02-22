import { describe, expect, it } from "vitest";
import { applyPipelineTemplate, buildStepPrompt, parsePipelineOutput } from "./pipeline-protocol.js";

describe("pipeline-protocol", () => {
  describe("parsePipelineOutput", () => {
    it("parses STATUS: done", () => {
      const result = parsePipelineOutput("Some output\nSTATUS: done\n");
      expect(result.status).toBe("done");
      expect(result.hasExplicitStatus).toBe(true);
    });

    it("parses STATUS: retry", () => {
      const result = parsePipelineOutput("STATUS: retry");
      expect(result.status).toBe("retry");
    });

    it("parses STATUS: fail", () => {
      const result = parsePipelineOutput("STATUS: fail");
      expect(result.status).toBe("fail");
    });

    it("defaults to done when no STATUS found", () => {
      const result = parsePipelineOutput("Just some output without structured status");
      expect(result.status).toBe("done");
      expect(result.hasExplicitStatus).toBe(false);
    });

    it("extracts KEY: value pairs", () => {
      const output = [
        "Analysis complete.",
        "FINDINGS: Found 3 issues in the auth module",
        "ISSUES: Missing error handling on line 42",
        "STORIES: 2 user stories need revision",
        "STATUS: done",
      ].join("\n");
      const result = parsePipelineOutput(output);
      expect(result.fields.FINDINGS).toBe("Found 3 issues in the auth module");
      expect(result.fields.ISSUES).toBe("Missing error handling on line 42");
      expect(result.fields.STORIES).toBe("2 user stories need revision");
    });

    it("does not include STATUS as a field", () => {
      const result = parsePipelineOutput("STATUS: done\nFINDINGS: test");
      expect(result.fields.STATUS).toBeUndefined();
      expect(result.fields.FINDINGS).toBe("test");
    });

    it("handles no fields", () => {
      const result = parsePipelineOutput("Just a message\nSTATUS: done");
      expect(Object.keys(result.fields)).toHaveLength(0);
    });

    it("preserves raw output", () => {
      const raw = "Hello\nSTATUS: done\nFINDINGS: stuff";
      const result = parsePipelineOutput(raw);
      expect(result.rawOutput).toBe(raw);
    });

    it("is case-insensitive for STATUS", () => {
      expect(parsePipelineOutput("status: Done").status).toBe("done");
      expect(parsePipelineOutput("Status: RETRY").status).toBe("retry");
    });
  });

  describe("applyPipelineTemplate", () => {
    it("substitutes {{KEY}} placeholders", () => {
      const template = "Review the {{FINDINGS}} and address {{ISSUES}}.";
      const result = applyPipelineTemplate(template, {
        FINDINGS: "3 bugs",
        ISSUES: "auth failure",
      });
      expect(result).toBe("Review the 3 bugs and address auth failure.");
    });

    it("leaves unmatched placeholders as-is", () => {
      const result = applyPipelineTemplate("Fix {{ISSUES}} and {{MISSING}}", {
        ISSUES: "the bug",
      });
      expect(result).toBe("Fix the bug and {{MISSING}}");
    });

    it("handles template with no placeholders", () => {
      const result = applyPipelineTemplate("No placeholders here", { FINDINGS: "data" });
      expect(result).toBe("No placeholders here");
    });

    it("handles empty fields", () => {
      const result = applyPipelineTemplate("{{FINDINGS}}", {});
      expect(result).toBe("{{FINDINGS}}");
    });
  });

  describe("buildStepPrompt", () => {
    it("returns template as-is when no previous output", () => {
      const step = { name: "verify", promptTemplate: "Verify the code" };
      expect(buildStepPrompt(step)).toBe("Verify the code");
    });

    it("substitutes fields from previous output", () => {
      const step = {
        name: "fix",
        promptTemplate: "Fix the following issues: {{ISSUES}}\nContext: {{FINDINGS}}",
      };
      const prev = parsePipelineOutput("ISSUES: auth bug\nFINDINGS: in middleware.ts\nSTATUS: retry");
      expect(buildStepPrompt(step, prev)).toBe(
        "Fix the following issues: auth bug\nContext: in middleware.ts",
      );
    });
  });
});
