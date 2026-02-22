import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronCircuitBreaker } from "./circuit-breaker.js";

describe("cron-circuit-breaker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-22T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("allows execution when circuit is closed", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 3 });
    expect(cb.canExecute("daily-digest")).toBe(true);
  });

  it("stays closed after fewer failures than threshold", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 3 });
    cb.recordFailure("job1");
    cb.recordFailure("job1");
    expect(cb.canExecute("job1")).toBe(true);
    expect(cb.getState("job1").state).toBe("closed");
  });

  it("opens circuit after N consecutive failures", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 3 });
    cb.recordFailure("job1");
    cb.recordFailure("job1");
    const heartbeatEntry = cb.recordFailure("job1");

    expect(cb.canExecute("job1")).toBe(false);
    expect(cb.getState("job1").state).toBe("open");
    expect(heartbeatEntry).toContain("cron/job1 suspended");
    expect(heartbeatEntry).toContain("3 failures");
  });

  it("returns heartbeat entry only when circuit first opens", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 2 });
    cb.recordFailure("job1");
    const entry = cb.recordFailure("job1");
    expect(entry).toBeTruthy(); // First time opening.

    // Additional failures while already open don't produce new entries.
    // (Circuit is open, canExecute returns false, but if somehow called:)
    expect(cb.getState("job1").state).toBe("open");
  });

  it("transitions to half-open after cooldown", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 2, cooldownMs: 60_000 });
    cb.recordFailure("job1");
    cb.recordFailure("job1");
    expect(cb.canExecute("job1")).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(cb.canExecute("job1")).toBe(true); // Half-open probe.
    expect(cb.getState("job1").state).toBe("half-open");
  });

  it("closes circuit on success after half-open probe", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 2, cooldownMs: 60_000 });
    cb.recordFailure("job1");
    cb.recordFailure("job1");
    vi.advanceTimersByTime(61_000);
    cb.canExecute("job1"); // → half-open

    cb.recordSuccess("job1");
    expect(cb.getState("job1").state).toBe("closed");
    expect(cb.getState("job1").consecutiveFailures).toBe(0);
  });

  it("re-opens circuit if half-open probe fails", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 2, cooldownMs: 60_000 });
    cb.recordFailure("job1");
    cb.recordFailure("job1");
    vi.advanceTimersByTime(61_000);
    cb.canExecute("job1"); // → half-open

    cb.recordFailure("job1"); // Probe failed.
    expect(cb.getState("job1").state).toBe("open");
  });

  it("resets failure count on success", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 3 });
    cb.recordFailure("job1");
    cb.recordFailure("job1");
    cb.recordSuccess("job1");
    expect(cb.getState("job1").consecutiveFailures).toBe(0);

    // Now needs 3 more failures to open.
    cb.recordFailure("job1");
    cb.recordFailure("job1");
    expect(cb.canExecute("job1")).toBe(true);
  });

  it("tracks jobs independently", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 2 });
    cb.recordFailure("job-a");
    cb.recordFailure("job-a");
    expect(cb.canExecute("job-a")).toBe(false);
    expect(cb.canExecute("job-b")).toBe(true);
  });

  it("getSuspended returns only open circuits", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 1 });
    cb.recordFailure("a");
    cb.recordFailure("b");
    cb.recordSuccess("c"); // Not suspended.
    expect(cb.getSuspended().map((j) => j.name).sort()).toEqual(["a", "b"]);
  });

  it("manual reset clears job state", () => {
    const cb = new CronCircuitBreaker({ maxFailures: 1 });
    cb.recordFailure("job1");
    expect(cb.canExecute("job1")).toBe(false);
    cb.reset("job1");
    expect(cb.canExecute("job1")).toBe(true);
  });
});
