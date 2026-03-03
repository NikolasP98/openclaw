/**
 * Message coalescing — per-user debounce for rapid-fire messages.
 *
 * When a user sends multiple messages within WINDOW_MS, they are batched
 * into a single flush call instead of triggering separate agent invocations.
 * This prevents the bot from responding to each fragment of a burst.
 *
 * Set COALESCE_MS=0 to disable coalescing (passthrough mode).
 *
 * @module
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type FlushCallback = (msgs: string[]) => void;

type CoalesceState = {
  msgs: string[];
  timer: ReturnType<typeof setTimeout>;
};

// ── Config ────────────────────────────────────────────────────────────────────

/** Default debounce window in milliseconds. Override with COALESCE_MS env var. */
export const DEFAULT_COALESCE_MS = 800;

export function getCoalesceMs(): number {
  const raw = process.env["COALESCE_MS"];
  if (raw === undefined) {
    return DEFAULT_COALESCE_MS;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_COALESCE_MS;
}

// ── State ─────────────────────────────────────────────────────────────────────

const coalescers = new Map<string, CoalesceState>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Buffer a message for userId and flush after the debounce window expires.
 *
 * If COALESCE_MS=0, flushes immediately (passthrough).
 *
 * @param userId  Unique per-user key (e.g. Telegram chat ID or account+peer composite)
 * @param text    Message text to buffer
 * @param flush   Callback invoked with all buffered messages when window expires
 */
export function coalesceMessage(userId: string, text: string, flush: FlushCallback): void {
  const windowMs = getCoalesceMs();

  if (windowMs === 0) {
    flush([text]);
    return;
  }

  const existing = coalescers.get(userId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.msgs.push(text);
    existing.timer = setTimeout(() => {
      coalescers.delete(userId);
      flush(existing.msgs);
    }, windowMs);
  } else {
    const state: CoalesceState = {
      msgs: [text],
      timer: setTimeout(() => {
        coalescers.delete(userId);
        flush(state.msgs);
      }, windowMs),
    };
    coalescers.set(userId, state);
  }
}

/**
 * Cancel any pending flush for a user and discard buffered messages.
 * Useful for cleanup on disconnect.
 */
export function cancelCoalesce(userId: string): void {
  const state = coalescers.get(userId);
  if (state) {
    clearTimeout(state.timer);
    coalescers.delete(userId);
  }
}

/**
 * Flush any pending messages for a user immediately, bypassing the timer.
 * Returns the flushed messages (empty array if nothing was pending).
 */
export function flushCoalesce(userId: string, flush: FlushCallback): string[] {
  const state = coalescers.get(userId);
  if (!state) {
    return [];
  }
  clearTimeout(state.timer);
  coalescers.delete(userId);
  const msgs = state.msgs.slice();
  flush(msgs);
  return msgs;
}

/** Number of users currently in the coalesce buffer (for monitoring). */
export function coalesceSize(): number {
  return coalescers.size;
}
