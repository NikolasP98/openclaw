/**
 * Gateway startup time profiler.
 *
 * Records per-subsystem timing during startup and prints a breakdown
 * at DEBUG log level. Confirms whether lazy init (S5) actually reduced
 * cold start time.
 *
 * Inspired by NullClaw's <2ms boot discipline — we can't match that in
 * Node.js, but we can at least measure what we have.
 *
 * Usage:
 *   const profiler = new StartupProfiler();
 *   profiler.mark("config");
 *   // ... load config ...
 *   profiler.mark("database");
 *   // ... init db ...
 *   profiler.done();  // prints breakdown
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("infra/startup-profiler");

export interface SubsystemTiming {
  name: string;
  durationMs: number;
}

export class StartupProfiler {
  private startTime: number;
  private marks: Array<{ name: string; timestamp: number }> = [];
  private finished = false;

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Mark the beginning of a new subsystem phase.
   * The previous phase (if any) is automatically closed.
   */
  mark(subsystem: string): void {
    this.marks.push({ name: subsystem, timestamp: performance.now() });
  }

  /**
   * Finish profiling and log the breakdown.
   * Returns the timing data for programmatic access.
   */
  done(): { totalMs: number; subsystems: SubsystemTiming[] } {
    if (this.finished) {
      return { totalMs: 0, subsystems: [] };
    }
    this.finished = true;
    const endTime = performance.now();
    const totalMs = Math.round(endTime - this.startTime);

    const subsystems: SubsystemTiming[] = [];
    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i]!;
      const nextTimestamp = i + 1 < this.marks.length
        ? this.marks[i + 1]!.timestamp
        : endTime;
      subsystems.push({
        name: mark.name,
        durationMs: Math.round(nextTimestamp - mark.timestamp),
      });
    }

    // Log the breakdown.
    const lines = subsystems
      .map((s) => `  ${s.name}: ${s.durationMs}ms`)
      .join("\n");
    log.debug(`Startup profiling (${totalMs}ms total):\n${lines}`);

    return { totalMs, subsystems };
  }

  /** Get elapsed time since profiler creation (for mid-startup checks). */
  elapsed(): number {
    return Math.round(performance.now() - this.startTime);
  }
}
