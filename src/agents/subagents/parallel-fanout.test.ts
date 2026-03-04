import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeFanout,
  formatFanoutResults,
  type FanoutTask,
  type SpawnFn,
} from "./parallel-fanout.js";

describe("parallel-fanout", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  const makeTasks = (n: number): FanoutTask[] =>
    Array.from({ length: n }, (_, i) => ({
      label: `task-${i}`,
      prompt: `Research topic ${i}`,
    }));

  const successSpawn: SpawnFn = async (task) => `Result for ${task.label}`;

  it("executes all tasks and collects results", async () => {
    const summary = await executeFanout(makeTasks(3), successSpawn);
    expect(summary.total).toBe(3);
    expect(summary.succeeded).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.results).toHaveLength(3);
    expect(summary.results[0].output).toContain("task-0");
  });

  it("caps at maxConcurrency", async () => {
    const summary = await executeFanout(makeTasks(10), successSpawn, { maxConcurrency: 3 });
    expect(summary.total).toBe(3); // Capped.
    expect(summary.results).toHaveLength(3);
  });

  it("handles failures in individual tasks", async () => {
    const failingSpawn: SpawnFn = async (task) => {
      if (task.label === "task-1") {
        throw new Error("boom");
      }
      return `Result for ${task.label}`;
    };
    const summary = await executeFanout(makeTasks(3), failingSpawn);
    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toBe(1);
    const failed = summary.results.find((r) => !r.success);
    expect(failed?.error).toContain("boom");
  });

  it("handles all tasks failing", async () => {
    const allFail: SpawnFn = async () => {
      throw new Error("fail");
    };
    const summary = await executeFanout(makeTasks(3), allFail);
    expect(summary.succeeded).toBe(0);
    expect(summary.failed).toBe(3);
  });

  it("handles empty task list", async () => {
    const summary = await executeFanout([], successSpawn);
    expect(summary.total).toBe(0);
    expect(summary.results).toHaveLength(0);
  });

  it("records duration per task", async () => {
    const summary = await executeFanout(makeTasks(2), successSpawn);
    for (const result of summary.results) {
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(summary.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  describe("formatFanoutResults", () => {
    it("formats successful results", async () => {
      const summary = await executeFanout(makeTasks(2), successSpawn);
      const text = formatFanoutResults(summary);
      expect(text).toContain("2/2 succeeded");
      expect(text).toContain("### task-0");
      expect(text).toContain("Result for task-0");
    });

    it("shows FAILED for failed tasks", async () => {
      const failSpawn: SpawnFn = async () => {
        throw new Error("oops");
      };
      const summary = await executeFanout(makeTasks(1), failSpawn);
      const text = formatFanoutResults(summary);
      expect(text).toContain("0/1 succeeded");
      expect(text).toContain("**FAILED**");
    });
  });
});
