import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelCoalesce,
  coalesceMessage,
  coalesceSize,
  DEFAULT_COALESCE_MS,
  flushCoalesce,
} from "./coalesce.js";

// Use fake timers so we can control setTimeout without actual delays
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Clean up any lingering coalesce state between tests
  cancelCoalesce("user-a");
  cancelCoalesce("user-b");
  cancelCoalesce("user-c");
  vi.unstubAllEnvs();
});

describe("coalesceMessage — batching behaviour", () => {
  it("flushes a single message after the debounce window", () => {
    const flushed: string[][] = [];
    coalesceMessage("user-a", "hello", (msgs) => flushed.push(msgs));

    expect(flushed).toHaveLength(0);
    vi.advanceTimersByTime(DEFAULT_COALESCE_MS);
    expect(flushed).toEqual([["hello"]]);
  });

  it("batches 3 rapid messages into a single invocation", () => {
    const flushed: string[][] = [];
    const flush = (msgs: string[]) => flushed.push(msgs);

    coalesceMessage("user-a", "one", flush);
    vi.advanceTimersByTime(100);
    coalesceMessage("user-a", "two", flush);
    vi.advanceTimersByTime(100);
    coalesceMessage("user-a", "three", flush);

    // Window hasn't expired yet — nothing flushed
    expect(flushed).toHaveLength(0);

    vi.advanceTimersByTime(DEFAULT_COALESCE_MS);
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toEqual(["one", "two", "three"]);
  });

  it("treats messages spaced beyond the window as separate turns", () => {
    const flushed: string[][] = [];
    const flush = (msgs: string[]) => flushed.push(msgs);

    coalesceMessage("user-a", "first", flush);
    vi.advanceTimersByTime(DEFAULT_COALESCE_MS + 50);

    coalesceMessage("user-a", "second", flush);
    vi.advanceTimersByTime(DEFAULT_COALESCE_MS + 50);

    expect(flushed).toHaveLength(2);
    expect(flushed[0]).toEqual(["first"]);
    expect(flushed[1]).toEqual(["second"]);
  });

  it("isolates buffers between different users", () => {
    const flushA: string[][] = [];
    const flushB: string[][] = [];

    coalesceMessage("user-a", "msg from A", (msgs) => flushA.push(msgs));
    coalesceMessage("user-b", "msg from B", (msgs) => flushB.push(msgs));

    vi.advanceTimersByTime(DEFAULT_COALESCE_MS);

    expect(flushA).toEqual([["msg from A"]]);
    expect(flushB).toEqual([["msg from B"]]);
  });

  it("resets the debounce timer on each new message", () => {
    const flushed: string[][] = [];

    coalesceMessage("user-a", "a", (msgs) => flushed.push(msgs));
    vi.advanceTimersByTime(DEFAULT_COALESCE_MS - 100);
    coalesceMessage("user-a", "b", (msgs) => flushed.push(msgs));

    // Timer was reset — advance the original window time but not the reset window
    vi.advanceTimersByTime(100);
    expect(flushed).toHaveLength(0);

    // Now advance the full reset window
    vi.advanceTimersByTime(DEFAULT_COALESCE_MS - 100);
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toEqual(["a", "b"]);
  });
});

describe("coalesceMessage — COALESCE_MS=0 passthrough", () => {
  it("flushes immediately when COALESCE_MS=0", () => {
    vi.stubEnv("COALESCE_MS", "0");
    const flushed: string[][] = [];

    coalesceMessage("user-a", "instant", (msgs) => flushed.push(msgs));

    // No timer advance needed — should have flushed synchronously
    expect(flushed).toEqual([["instant"]]);
  });

  it("does not buffer messages in passthrough mode", () => {
    vi.stubEnv("COALESCE_MS", "0");
    const flushed: string[][] = [];

    coalesceMessage("user-a", "one", (msgs) => flushed.push(msgs));
    coalesceMessage("user-a", "two", (msgs) => flushed.push(msgs));

    expect(flushed).toEqual([["one"], ["two"]]);
  });
});

describe("cancelCoalesce", () => {
  it("cancels pending flush and discards buffered messages", () => {
    const flushed: string[][] = [];

    coalesceMessage("user-a", "will be cancelled", (msgs) => flushed.push(msgs));
    cancelCoalesce("user-a");

    vi.advanceTimersByTime(DEFAULT_COALESCE_MS * 2);
    expect(flushed).toHaveLength(0);
  });

  it("is safe to call when no state exists", () => {
    expect(() => cancelCoalesce("no-such-user")).not.toThrow();
  });
});

describe("flushCoalesce", () => {
  it("flushes immediately and returns messages", () => {
    const flushed: string[][] = [];

    coalesceMessage("user-a", "pending", (msgs) => flushed.push(msgs));
    const returned = flushCoalesce("user-a", (msgs) => flushed.push(msgs));

    expect(returned).toEqual(["pending"]);
    expect(flushed).toEqual([["pending"]]);
  });

  it("returns empty array when no state exists", () => {
    const result = flushCoalesce("ghost-user", () => {});
    expect(result).toEqual([]);
  });

  it("prevents the original timer from firing after early flush", () => {
    const flushed: string[][] = [];

    coalesceMessage("user-a", "early", (msgs) => flushed.push(msgs));
    flushCoalesce("user-a", (msgs) => flushed.push(msgs));

    vi.advanceTimersByTime(DEFAULT_COALESCE_MS * 2);
    // Only the manual flush should have fired, not the timer
    expect(flushed).toHaveLength(1);
  });
});

describe("coalesceSize", () => {
  it("tracks the number of users currently in the buffer", () => {
    const size0 = coalesceSize();

    coalesceMessage("user-a", "x", () => {});
    coalesceMessage("user-b", "y", () => {});
    expect(coalesceSize()).toBe(size0 + 2);

    vi.advanceTimersByTime(DEFAULT_COALESCE_MS);
    expect(coalesceSize()).toBe(size0);
  });
});
