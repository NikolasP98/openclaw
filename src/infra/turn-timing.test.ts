import { describe, expect, it } from "vitest";
import { startTurnSpan, TurnTimingStore } from "./turn-timing.js";

describe("turn-timing", () => {
  describe("TurnTimingStore", () => {
    it("records and retrieves timings", () => {
      const store = new TurnTimingStore(100);
      store.record({ startedAt: "2026-02-21T12:00:00Z", modelLatencyMs: 500, toolLatencyMs: 200, totalMs: 750, toolCallCount: 2 });
      expect(store.size).toBe(1);
      expect(store.getAll()).toHaveLength(1);
    });

    it("enforces ring buffer max size", () => {
      const store = new TurnTimingStore(5);
      for (let i = 0; i < 10; i++) {
        store.record({ startedAt: `2026-02-21T12:0${i}:00Z`, modelLatencyMs: i * 100, toolLatencyMs: 0, totalMs: i * 100, toolCallCount: 0 });
      }
      expect(store.size).toBe(5);
      // Oldest entries evicted — first entry should be index 5.
      expect(store.getAll()[0]!.modelLatencyMs).toBe(500);
    });

    it("getRecent returns last N entries", () => {
      const store = new TurnTimingStore(100);
      for (let i = 0; i < 10; i++) {
        store.record({ startedAt: "", modelLatencyMs: i, toolLatencyMs: 0, totalMs: i, toolCallCount: 0 });
      }
      const recent = store.getRecent(3);
      expect(recent).toHaveLength(3);
      expect(recent[0]!.modelLatencyMs).toBe(7);
      expect(recent[2]!.modelLatencyMs).toBe(9);
    });

    it("computes stats correctly", () => {
      const store = new TurnTimingStore(100);
      store.record({ startedAt: "", modelLatencyMs: 100, toolLatencyMs: 50, totalMs: 160, toolCallCount: 1 });
      store.record({ startedAt: "", modelLatencyMs: 200, toolLatencyMs: 100, totalMs: 320, toolCallCount: 2 });
      store.record({ startedAt: "", modelLatencyMs: 300, toolLatencyMs: 0, totalMs: 310, toolCallCount: 0 });

      const stats = store.stats();
      expect(stats.count).toBe(3);
      expect(stats.modelLatency.avgMs).toBe(200);
      expect(stats.modelLatency.minMs).toBe(100);
      expect(stats.modelLatency.maxMs).toBe(300);
    });

    it("returns zero stats when empty", () => {
      const store = new TurnTimingStore();
      const stats = store.stats();
      expect(stats.count).toBe(0);
      expect(stats.modelLatency.avgMs).toBe(0);
    });

    it("clear removes all entries", () => {
      const store = new TurnTimingStore();
      store.record({ startedAt: "", modelLatencyMs: 100, toolLatencyMs: 0, totalMs: 100, toolCallCount: 0 });
      store.clear();
      expect(store.size).toBe(0);
    });
  });

  describe("startTurnSpan", () => {
    it("records model latency when markModelDone is called", () => {
      const span = startTurnSpan();
      // Simulate some work.
      span.markModelDone();
      span.addToolCall(50);
      const timing = span.finish({ model: "claude-sonnet-4", sessionKey: "test-session" });

      expect(timing.model).toBe("claude-sonnet-4");
      expect(timing.sessionKey).toBe("test-session");
      expect(timing.modelLatencyMs).toBeGreaterThanOrEqual(0);
      expect(timing.toolLatencyMs).toBe(50);
      expect(timing.toolCallCount).toBe(1);
      expect(timing.totalMs).toBeGreaterThanOrEqual(0);
      expect(timing.startedAt).toBeTruthy();
    });

    it("uses total time as model latency when markModelDone not called", () => {
      const span = startTurnSpan();
      const timing = span.finish();
      expect(timing.modelLatencyMs).toBe(timing.totalMs);
    });

    it("sums multiple tool calls", () => {
      const span = startTurnSpan();
      span.markModelDone();
      span.addToolCall(100);
      span.addToolCall(200);
      span.addToolCall(50);
      const timing = span.finish();
      expect(timing.toolLatencyMs).toBe(350);
      expect(timing.toolCallCount).toBe(3);
    });
  });
});
