import type { ReliabilityEvent } from "../gateway/protocol/schema/reliability.js";

const DEFAULT_CAPACITY = 1000;

export class ReliabilityRingBuffer {
  private buffer: (ReliabilityEvent | null)[];
  private head = 0;
  private count = 0;
  private readonly capacity: number;

  constructor(capacity = DEFAULT_CAPACITY) {
    this.capacity = capacity;
    this.buffer = Array.from<ReliabilityEvent | null>({ length: capacity }).fill(null);
  }

  push(event: ReliabilityEvent): void {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count += 1;
    }
  }

  query(opts?: { category?: string; since?: number; limit?: number }): ReliabilityEvent[] {
    const limit = opts?.limit ?? this.capacity;
    const result: ReliabilityEvent[] = [];

    // Read from oldest to newest
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count && result.length < limit; i++) {
      const idx = (start + i) % this.capacity;
      const evt = this.buffer[idx];
      if (!evt) {
        continue;
      }
      if (opts?.category && evt.category !== opts.category) {
        continue;
      }
      if (opts?.since && evt.timestamp < opts.since) {
        continue;
      }
      result.push(evt);
    }

    return result;
  }

  summary(): {
    total: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let total = 0;

    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const evt = this.buffer[idx];
      if (!evt) {
        continue;
      }
      total += 1;
      byCategory[evt.category] = (byCategory[evt.category] ?? 0) + 1;
      bySeverity[evt.severity] = (bySeverity[evt.severity] ?? 0) + 1;
    }

    return { total, byCategory, bySeverity };
  }

  clear(): void {
    this.buffer = Array.from<ReliabilityEvent | null>({ length: this.capacity }).fill(null);
    this.head = 0;
    this.count = 0;
  }

  get size(): number {
    return this.count;
  }
}
