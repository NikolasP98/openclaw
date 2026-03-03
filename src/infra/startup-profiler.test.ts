import { describe, expect, it } from "vitest";
import { StartupProfiler } from "./startup-profiler.js";

describe("startup-profiler", () => {
  it("records subsystem timings", () => {
    const profiler = new StartupProfiler();
    profiler.mark("config");
    profiler.mark("database");
    profiler.mark("channels");
    const result = profiler.done();

    expect(result.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.subsystems).toHaveLength(3);
    expect(result.subsystems[0]!.name).toBe("config");
    expect(result.subsystems[1]!.name).toBe("database");
    expect(result.subsystems[2]!.name).toBe("channels");
  });

  it("reports total elapsed time", () => {
    const profiler = new StartupProfiler();
    profiler.mark("step1");
    const result = profiler.done();
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });

  it("elapsed() returns time since creation", () => {
    const profiler = new StartupProfiler();
    expect(profiler.elapsed()).toBeGreaterThanOrEqual(0);
  });

  it("done() is idempotent", () => {
    const profiler = new StartupProfiler();
    profiler.mark("step1");
    const first = profiler.done();
    const second = profiler.done();
    expect(first.subsystems).toHaveLength(1);
    expect(second.totalMs).toBe(0);
  });

  it("handles no marks gracefully", () => {
    const profiler = new StartupProfiler();
    const result = profiler.done();
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
    expect(result.subsystems).toHaveLength(0);
  });
});
