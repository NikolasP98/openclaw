import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { deriveTraceId, pruneOldTraceFiles, traceChatEvent } from "./chat-trace.js";

describe("chat-trace", () => {
  const testAgentId = "__trace_test_agent__";

  afterAll(() => {
    // Clean up test trace files
    const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
    const agentDir = path.join(stateDir, "logs", "traces", testAgentId);
    try {
      if (fs.existsSync(agentDir)) {
        for (const f of fs.readdirSync(agentDir)) {
          fs.unlinkSync(path.join(agentDir, f));
        }
        fs.rmdirSync(agentDir);
      }
    } catch {
      // ignore cleanup errors
    }
  });

  describe("deriveTraceId", () => {
    it("extracts first 8 chars from long message ID", () => {
      expect(deriveTraceId("abcdef1234567890")).toBe("abcdef12");
    });

    it("generates 8-char random ID for short/null input", () => {
      expect(deriveTraceId("short")).toHaveLength(8);
      expect(deriveTraceId(null)).toHaveLength(8);
      expect(deriveTraceId(undefined)).toHaveLength(8);
    });
  });

  describe("traceChatEvent", () => {
    it("writes a trace line to the correct file", () => {
      traceChatEvent({
        agentId: testAgentId,
        traceId: "test1234",
        stage: "TEST_STAGE",
        data: { foo: "bar", num: 42 },
      });

      const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
      const today = new Date().toISOString().slice(0, 10);
      const traceFile = path.join(stateDir, "logs", "traces", testAgentId, `${today}.txt`);

      expect(fs.existsSync(traceFile)).toBe(true);
      const content = fs.readFileSync(traceFile, "utf-8");
      expect(content).toContain("[test1234] TEST_STAGE");
      expect(content).toContain("foo=bar");
      expect(content).toContain("num=42");
    });

    it("skips undefined/null/empty data values", () => {
      traceChatEvent({
        agentId: testAgentId,
        traceId: "test5678",
        stage: "SKIP_TEST",
        data: { present: "yes", missing: undefined, empty: "", nil: null },
      });

      const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
      const today = new Date().toISOString().slice(0, 10);
      const traceFile = path.join(stateDir, "logs", "traces", testAgentId, `${today}.txt`);
      const content = fs.readFileSync(traceFile, "utf-8");
      const line = content.split("\n").find((l) => l.includes("SKIP_TEST"))!;
      expect(line).toContain("present=yes");
      expect(line).not.toContain("missing=");
      expect(line).not.toContain("empty=");
      expect(line).not.toContain("nil=");
    });
  });

  describe("pruneOldTraceFiles", () => {
    it("does not throw on missing traces directory", () => {
      expect(() => pruneOldTraceFiles()).not.toThrow();
    });
  });
});
