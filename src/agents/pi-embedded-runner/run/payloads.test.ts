import { describe, expect, it } from "vitest";
import { buildEmbeddedRunPayloads } from "./payloads.js";

type BuildPayloadParams = Parameters<typeof buildEmbeddedRunPayloads>[0];

function buildPayloads(overrides: Partial<BuildPayloadParams> = {}) {
  return buildEmbeddedRunPayloads({
    assistantTexts: [],
    toolMetas: [],
    lastAssistant: undefined,
    sessionKey: "session:telegram",
    inlineToolResultsAllowed: false,
    verboseLevel: "off",
    reasoningLevel: "off",
    toolResultFormat: "plain",
    ...overrides,
  });
}

describe("buildEmbeddedRunPayloads consolidateIntermediateTexts", () => {
  it("sends all texts when consolidation is disabled", () => {
    const payloads = buildPayloads({
      assistantTexts: [
        "Let me check that...",
        "I'll try another approach...",
        "Here is your answer.",
      ],
    });
    expect(payloads).toHaveLength(3);
  });

  it("only sends last text when consolidation is enabled", () => {
    const payloads = buildPayloads({
      assistantTexts: [
        "Let me check that...",
        "I'll try another approach...",
        "Here is your answer.",
      ],
      consolidateIntermediateTexts: true,
    });
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe("Here is your answer.");
  });

  it("sends single text unchanged when consolidation is enabled", () => {
    const payloads = buildPayloads({
      assistantTexts: ["Here is your answer."],
      consolidateIntermediateTexts: true,
    });
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.text).toBe("Here is your answer.");
  });

  it("preserves error payloads alongside consolidated text", () => {
    const payloads = buildPayloads({
      assistantTexts: ["Intermediate thought", "Final answer"],
      consolidateIntermediateTexts: true,
      lastToolError: { toolName: "write", error: "failed", mutatingAction: true },
    });
    // Should have the consolidated text + the error warning
    const texts = payloads.filter((p) => !p.isError);
    const errors = payloads.filter((p) => p.isError);
    expect(texts).toHaveLength(1);
    expect(texts[0]?.text).toBe("Final answer");
    expect(errors).toHaveLength(1);
  });
});

describe("buildEmbeddedRunPayloads tool-error warnings", () => {
  it("suppresses exec tool errors when verbose mode is off", () => {
    const payloads = buildPayloads({
      lastToolError: { toolName: "exec", error: "command failed" },
      verboseLevel: "off",
    });

    expect(payloads).toHaveLength(0);
  });

  it("shows exec tool errors when verbose mode is on", () => {
    const payloads = buildPayloads({
      lastToolError: { toolName: "exec", error: "command failed" },
      verboseLevel: "on",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.isError).toBe(true);
    expect(payloads[0]?.text).toContain("Exec");
    expect(payloads[0]?.text).toContain("command failed");
  });

  it("keeps non-exec mutating tool failures visible", () => {
    const payloads = buildPayloads({
      lastToolError: { toolName: "write", error: "permission denied" },
      verboseLevel: "off",
    });

    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.isError).toBe(true);
    expect(payloads[0]?.text).toContain("Write");
  });
});
