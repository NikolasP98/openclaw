import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeQueueCount,
  clearQueues,
  enqueueForUser,
} from "./user-queue.js";

afterEach(() => {
  clearQueues();
});

// ── Serial ordering ──────────────────────────────────────────────────────────

describe("serial ordering per user", () => {
  it("processes tasks in enqueue order for the same user", async () => {
    const order: number[] = [];
    await Promise.all([
      enqueueForUser("alice", async () => { order.push(1); }),
      enqueueForUser("alice", async () => { order.push(2); }),
      enqueueForUser("alice", async () => { order.push(3); }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("does not start second task before first completes", async () => {
    const log: string[] = [];
    let resolveFirst!: () => void;
    const firstDone = new Promise<void>((res) => { resolveFirst = res; });

    const p1 = enqueueForUser("bob", async () => {
      log.push("start-1");
      await firstDone;
      log.push("end-1");
    });
    const p2 = enqueueForUser("bob", async () => {
      log.push("start-2");
    });

    // Allow the Promise chain to settle and task 1 to begin (setTimeout flushes microtasks)
    await new Promise<void>((res) => setTimeout(res, 0));
    expect(log).toContain("start-1");
    expect(log).not.toContain("end-1");
    expect(log).not.toContain("start-2"); // task 2 blocked waiting for task 1

    resolveFirst();
    await Promise.all([p1, p2]);
    expect(log).toEqual(["start-1", "end-1", "start-2"]);
  });
});

// ── Concurrency across users ─────────────────────────────────────────────────

describe("concurrency across users", () => {
  it("runs tasks for different users in parallel", async () => {
    const starts: string[] = [];
    const completions: string[] = [];

    let resolveAlice!: () => void;
    let resolveBob!: () => void;

    const aliceDone = new Promise<void>((res) => { resolveAlice = res; });
    const bobDone = new Promise<void>((res) => { resolveBob = res; });

    const pa = enqueueForUser("alice", async () => {
      starts.push("alice");
      await aliceDone;
      completions.push("alice");
    });
    const pb = enqueueForUser("bob", async () => {
      starts.push("bob");
      await bobDone;
      completions.push("bob");
    });

    // Flush microtasks so both tasks start
    await Promise.resolve();
    await Promise.resolve();

    // Both should have started concurrently
    expect(starts.sort()).toEqual(["alice", "bob"]);
    // Neither has completed yet
    expect(completions).toHaveLength(0);

    resolveAlice();
    resolveBob();
    await Promise.all([pa, pb]);

    expect(completions.sort()).toEqual(["alice", "bob"]);
  });
});

// ── Error resilience ─────────────────────────────────────────────────────────

describe("error resilience", () => {
  it("subsequent tasks still run after a task failure", async () => {
    const results: string[] = [];

    const p1 = enqueueForUser("user", async () => {
      throw new Error("oops");
    });
    const p2 = enqueueForUser("user", async () => {
      results.push("ran after failure");
    });

    await expect(p1).rejects.toThrow("oops");
    await p2;

    expect(results).toContain("ran after failure");
  });

  it("propagates the error to the caller of the failing task", async () => {
    const p = enqueueForUser("user", async () => {
      throw new Error("task-error");
    });
    await expect(p).rejects.toThrow("task-error");
  });

  it("does not propagate one user's error to another user's tasks", async () => {
    const results: string[] = [];

    // Alice fails
    void enqueueForUser("alice", async () => { throw new Error("alice-error"); });

    // Bob should still succeed
    const pb = enqueueForUser("bob", async () => {
      results.push("bob-ok");
    });

    await pb;
    expect(results).toContain("bob-ok");
  });
});

// ── Queue cleanup ────────────────────────────────────────────────────────────

describe("queue cleanup", () => {
  it("queue entry is removed after the last task drains", async () => {
    const p = enqueueForUser("user", async () => {});
    await p;
    // Give the cleanup microtask a chance to run
    await Promise.resolve();
    expect(activeQueueCount()).toBe(0);
  });

  it("queue entry stays while tasks are pending", () => {
    let resolve!: () => void;
    const blocker = new Promise<void>((res) => { resolve = res; });
    void enqueueForUser("user", () => blocker);
    expect(activeQueueCount()).toBe(1);
    resolve();
  });

  it("clearQueues resets the count", async () => {
    void enqueueForUser("a", async () => {});
    void enqueueForUser("b", async () => {});
    clearQueues();
    expect(activeQueueCount()).toBe(0);
  });
});

// ── activeQueueCount ─────────────────────────────────────────────────────────

describe("activeQueueCount", () => {
  it("returns 0 initially", () => {
    expect(activeQueueCount()).toBe(0);
  });

  it("counts distinct users with active queues", () => {
    // Tasks are registered immediately (the Promise chain tail is set synchronously)
    void enqueueForUser("u1", () => new Promise<void>(() => {})); // never resolves
    void enqueueForUser("u2", () => new Promise<void>(() => {})); // never resolves
    expect(activeQueueCount()).toBe(2);
    // afterEach clearQueues() handles cleanup
  });

  it("same user only counts as one queue", () => {
    void enqueueForUser("u1", () => new Promise<void>(() => {})); // never resolves
    void enqueueForUser("u1", async () => {});
    expect(activeQueueCount()).toBe(1);
    // afterEach clearQueues() handles cleanup
  });
});

// ── Stress / ordering guarantee ───────────────────────────────────────────────

describe("ordering guarantee under load", () => {
  it("10 tasks enqueued for the same user run in order", async () => {
    const results: number[] = [];
    const tasks = Array.from({ length: 10 }, (_, i) =>
      enqueueForUser("heavy-user", async () => { results.push(i); }),
    );
    await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("10 tasks across 5 users all complete", async () => {
    const results: string[] = [];
    const tasks = Array.from({ length: 10 }, (_, i) =>
      enqueueForUser(`user-${i % 5}`, async () => { results.push(`task-${i}`); }),
    );
    await Promise.all(tasks);
    expect(results).toHaveLength(10);
  });
});
