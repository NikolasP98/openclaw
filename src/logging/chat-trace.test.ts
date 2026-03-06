import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  deriveTraceId,
  pruneOldTraceFiles,
  traceChannelEvent,
  traceChatEvent,
  traceGatewayEvent,
} from "./chat-trace.js";

describe("chat-trace", () => {
  const testAgentId = "__trace_test_agent__";
  const gatewayScope = "_gateway";
  const channelsScope = "_channels";

  afterAll(() => {
    const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
    for (const scope of [testAgentId, gatewayScope, channelsScope]) {
      const dir = path.join(stateDir, "logs", "traces", scope);
      try {
        if (fs.existsSync(dir)) {
          for (const f of fs.readdirSync(dir)) {
            fs.unlinkSync(path.join(dir, f));
          }
          fs.rmdirSync(dir);
        }
      } catch {
        // ignore cleanup errors
      }
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
    it("writes a trace line with level prefix", () => {
      traceChatEvent({
        agentId: testAgentId,
        traceId: "test1234",
        level: "INFO",
        stage: "TEST_STAGE",
        data: { foo: "bar", num: 42 },
      });

      const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
      const today = new Date().toISOString().slice(0, 10);
      const traceFile = path.join(stateDir, "logs", "traces", testAgentId, `${today}.txt`);

      expect(fs.existsSync(traceFile)).toBe(true);
      const content = fs.readFileSync(traceFile, "utf-8");
      expect(content).toContain("[test1234] INFO:TEST_STAGE");
      expect(content).toContain("foo=bar");
      expect(content).toContain("num=42");
    });

    it("supports all log levels", () => {
      for (const level of ["ERROR", "WARN", "INFO", "DEBUG"] as const) {
        traceChatEvent({
          agentId: testAgentId,
          traceId: "lvl12345",
          level,
          stage: `${level}_TEST`,
        });
      }

      const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
      const today = new Date().toISOString().slice(0, 10);
      const traceFile = path.join(stateDir, "logs", "traces", testAgentId, `${today}.txt`);
      const content = fs.readFileSync(traceFile, "utf-8");
      expect(content).toContain("ERROR:ERROR_TEST");
      expect(content).toContain("WARN:WARN_TEST");
      expect(content).toContain("INFO:INFO_TEST");
      expect(content).toContain("DEBUG:DEBUG_TEST");
    });

    it("skips undefined/null/empty data values", () => {
      traceChatEvent({
        agentId: testAgentId,
        traceId: "test5678",
        level: "DEBUG",
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

  describe("traceGatewayEvent", () => {
    it("writes to the _gateway scope with level", () => {
      traceGatewayEvent({
        traceId: "gw123456",
        level: "INFO",
        stage: "INGESTED",
        data: { channel: "whatsapp", agentId: "renzo_bot" },
      });

      const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
      const today = new Date().toISOString().slice(0, 10);
      const gwFile = path.join(stateDir, "logs", "traces", gatewayScope, `${today}.txt`);

      expect(fs.existsSync(gwFile)).toBe(true);
      const content = fs.readFileSync(gwFile, "utf-8");
      expect(content).toContain("[gw123456] INFO:INGESTED");
      expect(content).toContain("channel=whatsapp");
      expect(content).toContain("agentId=renzo_bot");
    });

    it("writes ERROR level for failures", () => {
      traceGatewayEvent({
        traceId: "gwerr123",
        level: "ERROR",
        stage: "LLM_ERROR",
        data: { error: "all models failed" },
      });

      const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
      const today = new Date().toISOString().slice(0, 10);
      const gwFile = path.join(stateDir, "logs", "traces", gatewayScope, `${today}.txt`);
      const content = fs.readFileSync(gwFile, "utf-8");
      expect(content).toContain("ERROR:LLM_ERROR");
    });
  });

  describe("traceChannelEvent", () => {
    it("writes to the _channels scope", () => {
      traceChannelEvent({
        traceId: "ch123456",
        level: "WARN",
        stage: "CHANNEL_DISCONNECTED",
        data: { channel: "whatsapp", statusCode: 401 },
      });

      const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".minion");
      const today = new Date().toISOString().slice(0, 10);
      const chFile = path.join(stateDir, "logs", "traces", channelsScope, `${today}.txt`);

      expect(fs.existsSync(chFile)).toBe(true);
      const content = fs.readFileSync(chFile, "utf-8");
      expect(content).toContain("[ch123456] WARN:CHANNEL_DISCONNECTED");
      expect(content).toContain("channel=whatsapp");
      expect(content).toContain("statusCode=401");
    });
  });

  describe("pruneOldTraceFiles", () => {
    it("does not throw on missing traces directory", () => {
      expect(() => pruneOldTraceFiles()).not.toThrow();
    });
  });
});
