import { describe, expect, it } from "vitest";
import { GroupQueue } from "./group-queue.js";

describe("GroupQueue", () => {
  describe("enqueue + drain", () => {
    it("enqueues and drains a message FIFO", () => {
      const q = new GroupQueue();
      q.enqueue("g1", "m1", { text: "hello" });
      q.enqueue("g1", "m2", { text: "world" });

      const first = q.drain("g1");
      expect(first).toBeDefined();
      expect(first!.id).toBe("m1");
      expect(first!.payload).toEqual({ text: "hello" });

      // Can't drain second until first completes (maxConcurrent=1)
      expect(q.drain("g1")).toBeUndefined();

      q.complete("g1");
      const second = q.drain("g1");
      expect(second!.id).toBe("m2");
    });

    it("returns undefined for empty group", () => {
      const q = new GroupQueue();
      expect(q.drain("nonexistent")).toBeUndefined();
    });

    it("returns undefined for unknown group", () => {
      const q = new GroupQueue();
      expect(q.drain("g1")).toBeUndefined();
    });
  });

  describe("concurrency cap", () => {
    it("respects maxConcurrent setting", () => {
      const q = new GroupQueue({ maxConcurrent: 2 });
      q.enqueue("g1", "m1", "a");
      q.enqueue("g1", "m2", "b");
      q.enqueue("g1", "m3", "c");

      expect(q.drain("g1")).toBeDefined(); // m1
      expect(q.drain("g1")).toBeDefined(); // m2
      expect(q.drain("g1")).toBeUndefined(); // blocked — 2 active

      q.complete("g1");
      expect(q.drain("g1")).toBeDefined(); // m3
    });
  });

  describe("backoff", () => {
    it("applies backoff on failure", () => {
      const q = new GroupQueue({ initialBackoffMs: 1000 });
      q.enqueue("g1", "m1", "a");
      q.enqueue("g1", "m2", "b");

      q.drain("g1"); // m1
      q.fail("g1");

      // Immediately after failure, drain should be blocked by backoff
      const state = q.getState("g1");
      expect(state!.backoffMs).toBe(1000);
      expect(state!.consecutiveFailures).toBe(1);

      // Drain blocked during backoff
      expect(q.drain("g1")).toBeUndefined();
    });

    it("allows drain after backoff expires", () => {
      const q = new GroupQueue({ initialBackoffMs: 100 });
      q.enqueue("g1", "m1", "a");
      q.enqueue("g1", "m2", "b");

      q.drain("g1");
      q.fail("g1");

      // Simulate time passing beyond backoff
      const futureTime = Date.now() + 200;
      const msg = q.drain("g1", futureTime);
      expect(msg).toBeDefined();
      expect(msg!.id).toBe("m2");
    });

    it("applies exponential backoff on consecutive failures", () => {
      const q = new GroupQueue({ initialBackoffMs: 100, backoffMultiplier: 2 });
      q.enqueue("g1", "m1", "a");
      q.enqueue("g1", "m2", "b");
      q.enqueue("g1", "m3", "c");

      // First failure: 100ms backoff
      q.drain("g1");
      q.fail("g1");
      expect(q.getState("g1")!.backoffMs).toBe(100);

      // Second failure: 200ms backoff
      const t1 = Date.now() + 200;
      q.drain("g1", t1);
      q.fail("g1");
      expect(q.getState("g1")!.backoffMs).toBe(200);

      // Third failure: 400ms backoff
      const t2 = Date.now() + 500;
      q.drain("g1", t2);
      q.fail("g1");
      expect(q.getState("g1")!.backoffMs).toBe(400);
    });

    it("caps backoff at maxBackoffMs", () => {
      const q = new GroupQueue({
        initialBackoffMs: 10000,
        maxBackoffMs: 30000,
        backoffMultiplier: 10,
      });
      q.enqueue("g1", "m1", "a");
      q.enqueue("g1", "m2", "b");

      q.drain("g1");
      q.fail("g1");

      // 10000 * 10^0 = 10000 (first)
      expect(q.getState("g1")!.backoffMs).toBe(10000);

      const t1 = Date.now() + 20000;
      q.drain("g1", t1);
      q.fail("g1");

      // 10000 * 10^1 = 100000 → capped at 30000
      expect(q.getState("g1")!.backoffMs).toBe(30000);
    });

    it("resets backoff on success", () => {
      const q = new GroupQueue({ initialBackoffMs: 1000 });
      q.enqueue("g1", "m1", "a");
      q.enqueue("g1", "m2", "b");

      q.drain("g1");
      q.fail("g1");
      expect(q.getState("g1")!.consecutiveFailures).toBe(1);

      const t = Date.now() + 2000;
      q.drain("g1", t);
      q.complete("g1");

      const state = q.getState("g1")!;
      expect(state.consecutiveFailures).toBe(0);
      expect(state.backoffMs).toBe(0);
      expect(state.backoffUntil).toBe(0);
    });
  });

  describe("multi-group isolation", () => {
    it("groups are independent", () => {
      const q = new GroupQueue();
      q.enqueue("g1", "m1", "a");
      q.enqueue("g2", "m2", "b");

      // Both groups can drain independently
      expect(q.drain("g1")).toBeDefined();
      expect(q.drain("g2")).toBeDefined();
    });

    it("failure in one group does not affect another", () => {
      const q = new GroupQueue({ initialBackoffMs: 1000 });
      q.enqueue("g1", "m1", "a");
      q.enqueue("g1", "m2", "b");
      q.enqueue("g2", "m3", "c");

      q.drain("g1");
      q.fail("g1"); // g1 in backoff

      // g2 should still work
      expect(q.drain("g2")).toBeDefined();
    });
  });

  describe("utility methods", () => {
    it("totalPending returns count across all groups", () => {
      const q = new GroupQueue();
      q.enqueue("g1", "m1", "a");
      q.enqueue("g1", "m2", "b");
      q.enqueue("g2", "m3", "c");

      expect(q.totalPending()).toBe(3);

      q.drain("g1");
      expect(q.totalPending()).toBe(2);
    });

    it("activeGroupIds returns groups with work", () => {
      const q = new GroupQueue();
      q.enqueue("g1", "m1", "a");
      q.enqueue("g2", "m2", "b");

      const ids = q.activeGroupIds();
      expect(ids).toContain("g1");
      expect(ids).toContain("g2");
    });

    it("removeGroup clears group state", () => {
      const q = new GroupQueue();
      q.enqueue("g1", "m1", "a");
      q.removeGroup("g1");

      expect(q.getState("g1")).toBeUndefined();
      expect(q.totalPending()).toBe(0);
    });
  });
});
