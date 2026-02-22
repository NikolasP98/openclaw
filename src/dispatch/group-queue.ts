/**
 * Per-group message queue — FIFO queue with concurrency cap and backoff.
 *
 * Each chat group gets its own queue to prevent one busy group from
 * starving others. Messages are drained in FIFO order with a configurable
 * concurrency limit per group.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type GroupState = {
  /** Number of messages currently being processed. */
  active: number;
  /** FIFO queue of pending messages. */
  pending: QueuedMessage[];
  /** Current backoff delay in ms (0 = no backoff). */
  backoffMs: number;
  /** Timestamp when backoff expires (0 = not in backoff). */
  backoffUntil: number;
  /** Number of consecutive failures for backoff calculation. */
  consecutiveFailures: number;
};

export type QueuedMessage = {
  id: string;
  groupId: string;
  payload: unknown;
  enqueuedAt: number;
};

export type GroupQueueConfig = {
  /** Max concurrent messages per group (default: 1). */
  maxConcurrent?: number;
  /** Initial backoff delay in ms after failure (default: 1000). */
  initialBackoffMs?: number;
  /** Maximum backoff delay in ms (default: 30000). */
  maxBackoffMs?: number;
  /** Backoff multiplier per consecutive failure (default: 2). */
  backoffMultiplier?: number;
};

// ── Implementation ───────────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENT = 1;
const DEFAULT_INITIAL_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;

export class GroupQueue {
  private groups = new Map<string, GroupState>();
  private config: Required<GroupQueueConfig>;

  constructor(config?: GroupQueueConfig) {
    this.config = {
      maxConcurrent: config?.maxConcurrent ?? DEFAULT_MAX_CONCURRENT,
      initialBackoffMs: config?.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS,
      maxBackoffMs: config?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
      backoffMultiplier: config?.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER,
    };
  }

  /**
   * Enqueue a message for a group.
   */
  enqueue(groupId: string, id: string, payload: unknown): void {
    const state = this.getOrCreate(groupId);
    state.pending.push({
      id,
      groupId,
      payload,
      enqueuedAt: Date.now(),
    });
  }

  /**
   * Try to drain the next message from a group's queue.
   *
   * Returns the next message if the group has capacity and isn't in backoff.
   * Returns undefined if the group is at capacity, in backoff, or empty.
   */
  drain(groupId: string, now?: number): QueuedMessage | undefined {
    const state = this.groups.get(groupId);
    if (!state || state.pending.length === 0) {
      return undefined;
    }

    const currentTime = now ?? Date.now();

    // Check backoff
    if (state.backoffUntil > currentTime) {
      return undefined;
    }

    // Check concurrency cap
    if (state.active >= this.config.maxConcurrent) {
      return undefined;
    }

    const message = state.pending.shift()!;
    state.active++;
    return message;
  }

  /**
   * Mark a message as completed (successfully processed).
   * Resets backoff on success.
   */
  complete(groupId: string): void {
    const state = this.groups.get(groupId);
    if (!state) {
      return;
    }
    state.active = Math.max(0, state.active - 1);
    state.consecutiveFailures = 0;
    state.backoffMs = 0;
    state.backoffUntil = 0;
  }

  /**
   * Mark a message as failed. Applies exponential backoff.
   */
  fail(groupId: string): void {
    const state = this.groups.get(groupId);
    if (!state) {
      return;
    }
    state.active = Math.max(0, state.active - 1);
    state.consecutiveFailures++;

    // Calculate exponential backoff
    const delay = Math.min(
      this.config.initialBackoffMs *
        Math.pow(this.config.backoffMultiplier, state.consecutiveFailures - 1),
      this.config.maxBackoffMs,
    );
    state.backoffMs = delay;
    state.backoffUntil = Date.now() + delay;
  }

  /**
   * Get the current state of a group.
   */
  getState(groupId: string): GroupState | undefined {
    const state = this.groups.get(groupId);
    if (!state) {
      return undefined;
    }
    return { ...state, pending: [...state.pending] };
  }

  /**
   * Get the number of pending messages across all groups.
   */
  totalPending(): number {
    let total = 0;
    for (const state of this.groups.values()) {
      total += state.pending.length;
    }
    return total;
  }

  /**
   * Get all group IDs that have pending messages or active processing.
   */
  activeGroupIds(): string[] {
    const ids: string[] = [];
    for (const [id, state] of this.groups) {
      if (state.pending.length > 0 || state.active > 0) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Remove a group's state entirely.
   */
  removeGroup(groupId: string): void {
    this.groups.delete(groupId);
  }

  private getOrCreate(groupId: string): GroupState {
    let state = this.groups.get(groupId);
    if (!state) {
      state = {
        active: 0,
        pending: [],
        backoffMs: 0,
        backoffUntil: 0,
        consecutiveFailures: 0,
      };
      this.groups.set(groupId, state);
    }
    return state;
  }
}
