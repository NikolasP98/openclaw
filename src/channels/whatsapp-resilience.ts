/**
 * WhatsApp resilience utilities.
 *
 * - LID-to-JID translation (WhatsApp's new internal ID format)
 * - Outgoing message buffer during disconnects
 * - Internal tag stripping from outbound messages
 *
 * Inspired by NanoClaw's WhatsApp-native patterns.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("channels/whatsapp-resilience");

// ── LID-to-JID Translation (S10.2) ──────────────────────────────────

/**
 * WhatsApp is rolling out LID (Linked ID) format: `1234567890@lid`
 * alongside the traditional phone JID: `+15551234567@s.whatsapp.net`.
 *
 * Messages from newer clients may arrive with LID addresses. Without
 * translation, they're silently dropped. This cache + fallback pattern
 * handles the translation.
 */

const lidToJidCache = new Map<string, string>();

export function isLidJid(jid: string): boolean {
  return jid.endsWith("@lid");
}

/**
 * Translate a JID, resolving LID format to phone JID if possible.
 *
 * @param jid - The incoming JID (may be LID or phone format)
 * @param lookupFn - Optional async lookup via sock.signalRepository (Baileys)
 * @returns The phone JID, or the original JID if translation isn't available
 */
export async function translateJid(
  jid: string,
  lookupFn?: (lid: string) => Promise<string | undefined>,
): Promise<string> {
  if (!isLidJid(jid)) {
    return jid;
  }

  // Check cache first.
  const cached = lidToJidCache.get(jid);
  if (cached) {
    return cached;
  }

  // Try the Baileys signalRepository lookup.
  if (lookupFn) {
    try {
      const phoneJid = await lookupFn(jid);
      if (phoneJid) {
        lidToJidCache.set(jid, phoneJid);
        log.debug(`LID translated: ${jid} → ${phoneJid}`);
        return phoneJid;
      }
    } catch (err) {
      log.debug(`LID lookup failed for ${jid}: ${err}`);
    }
  }

  // No translation available — return as-is (better than dropping).
  log.debug(`LID ${jid} could not be translated — using as-is`);
  return jid;
}

/** Manually register a LID→JID mapping (e.g. from a pairing event). */
export function registerLidMapping(lid: string, phoneJid: string): void {
  lidToJidCache.set(lid, phoneJid);
}

/** Clear the LID cache (for testing). */
export function clearLidCache(): void {
  lidToJidCache.clear();
}

// ── Disconnect Message Buffer (S10.3) ────────────────────────────────

/**
 * Buffers outgoing messages when WhatsApp is disconnected.
 * Flushes in order on reconnect. Bounded to prevent memory leaks.
 */

export interface BufferedMessage {
  jid: string;
  content: string;
  options?: Record<string, unknown>;
  queuedAt: number;
}

const DEFAULT_MAX_BUFFER = 100;

export class DisconnectBuffer {
  private buffer: BufferedMessage[] = [];
  private maxSize: number;

  constructor(maxSize = DEFAULT_MAX_BUFFER) {
    this.maxSize = maxSize;
  }

  /** Queue a message for later delivery. */
  enqueue(msg: Omit<BufferedMessage, "queuedAt">): void {
    if (this.buffer.length >= this.maxSize) {
      // Drop oldest to make room.
      const dropped = this.buffer.shift();
      log.debug(`Buffer full — dropped oldest message to ${dropped?.jid}`);
    }
    this.buffer.push({ ...msg, queuedAt: Date.now() });
    log.debug(`Buffered message for ${msg.jid} (${this.buffer.length}/${this.maxSize})`);
  }

  /**
   * Flush all buffered messages in order.
   * The sendFn is called for each message. If it throws, remaining
   * messages stay in the buffer for the next flush attempt.
   */
  async flush(sendFn: (msg: BufferedMessage) => Promise<void>): Promise<number> {
    let sent = 0;
    while (this.buffer.length > 0) {
      const msg = this.buffer[0]!;
      try {
        await sendFn(msg);
        this.buffer.shift();
        sent++;
      } catch (err) {
        log.warn(`Buffer flush failed at message ${sent + 1}: ${err}`);
        break;
      }
    }
    if (sent > 0) {
      log.debug(`Flushed ${sent} buffered messages (${this.buffer.length} remaining)`);
    }
    return sent;
  }

  get size(): number {
    return this.buffer.length;
  }

  get isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /** Clear all buffered messages. */
  clear(): void {
    this.buffer = [];
  }
}

// ── Internal Tag Stripping (S10.4) ───────────────────────────────────

/**
 * Strip `<internal>...</internal>` blocks from outbound messages.
 *
 * Claude's chain-of-thought sometimes leaks into responses wrapped in
 * `<internal>` tags. These should never be sent to end users.
 */
const INTERNAL_TAG_RE = /<internal>[\s\S]*?<\/internal>/gi;

export function stripInternalTags(content: string): string {
  return content.replace(INTERNAL_TAG_RE, "").trim();
}

/**
 * Also strip `<thinking>...</thinking>` blocks (common in extended thinking models).
 */
const THINKING_TAG_RE = /<thinking>[\s\S]*?<\/thinking>/gi;

export function stripThinkingTags(content: string): string {
  return content.replace(THINKING_TAG_RE, "").trim();
}

/**
 * Strip all internal/thinking tags from outbound content.
 */
export function sanitizeOutbound(content: string): string {
  let result = content;
  result = result.replace(INTERNAL_TAG_RE, "");
  result = result.replace(THINKING_TAG_RE, "");
  return result.trim();
}
