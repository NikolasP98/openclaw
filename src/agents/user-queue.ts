/**
 * Per-user async task isolation.
 *
 * Each user (identified by a string key) gets an independent async execution
 * context backed by a Promise chain. Key properties:
 *
 *   - Tasks for the same user run serially (queue order preserved).
 *   - Tasks for different users run concurrently (queues drain independently).
 *   - A task failure does NOT drop subsequent tasks for the same user.
 *   - Queues are self-cleaning — entries are removed when the chain drains.
 *
 * Designed for use in the inbound message dispatch path:
 *
 * @example
 * // In channel dispatch handler:
 * enqueueForUser(userId, () => handleMessageTurn(ctx, message));
 *
 * @module
 */

type Task = () => Promise<void>;

const queues = new Map<string, Promise<void>>();

/**
 * Enqueue a task for the given user key.
 *
 * Returns a Promise that resolves or rejects when THIS specific task completes.
 * The returned Promise is independent of subsequent tasks queued for the same user.
 *
 * @param userKey - Stable identifier for the user/conversation (e.g. userId, sessionKey)
 * @param task    - Async work to run in the user's queue
 */
export function enqueueForUser(userKey: string, task: Task): Promise<void> {
  const current = queues.get(userKey) ?? Promise.resolve();

  // Wait for the current tail to settle (success OR failure) before running the
  // next task. We swallow the previous error in the chain so task failures never
  // poison subsequent queue entries.
  const settled = current.then(undefined, () => undefined);
  const next = settled.then(() => task());

  // Advance the tail pointer.
  queues.set(userKey, next);

  // Self-cleaning: remove the queue entry only if no newer task has replaced it.
  void next.then(
    () => { if (queues.get(userKey) === next) queues.delete(userKey); },
    () => { if (queues.get(userKey) === next) queues.delete(userKey); },
  );

  return next;
}

/**
 * Returns the number of users with active (non-drained) queues.
 * Useful for observability and tests.
 */
export function activeQueueCount(): number {
  return queues.size;
}

/**
 * Drain and remove all queues.
 * Does NOT cancel in-flight tasks — they run to completion.
 * Intended for graceful shutdown and test teardown.
 */
export function clearQueues(): void {
  queues.clear();
}
