/**
 * Channel bus types — unified inbound/outbound message interfaces.
 *
 * Provides a channel-agnostic message format that all channel adapters
 * normalize to/from. Decouples the dispatch pipeline from channel-specific
 * message shapes.
 *
 * @module
 */

import type { ChannelId } from "./plugins/types.core.js";

// ── Inbound ──────────────────────────────────────────────────────────────────

export type InboundMessageType = "text" | "image" | "audio" | "file" | "reaction" | "command";

export type InboundMessage = {
  /** Unique message ID from the source channel. */
  id: string;
  /** Channel the message came from. */
  channel: ChannelId;
  /** Message type. */
  type: InboundMessageType;
  /** Sender identifier (channel-specific format). */
  senderId: string;
  /** Optional sender display name. */
  senderName?: string;
  /** Text content (for text/command types). */
  text?: string;
  /** Media URL or path (for image/audio/file types). */
  mediaUrl?: string;
  /** MIME type of attached media. */
  mediaMimeType?: string;
  /** Group/chat ID if from a group conversation. */
  groupId?: string;
  /** Thread/topic ID for threaded conversations. */
  threadId?: string;
  /** Whether this is a direct message (not group). */
  isDirect: boolean;
  /** Whether the bot was mentioned/tagged. */
  isMention: boolean;
  /** ISO timestamp when the message was sent. */
  timestamp: string;
  /** Optional account ID for multi-account channels. */
  accountId?: string;
  /** Raw channel-specific payload (for passthrough). */
  raw?: unknown;
};

// ── Outbound ─────────────────────────────────────────────────────────────────

export type OutboundMessageType = "text" | "image" | "audio" | "file" | "reaction" | "typing";

export type OutboundMessage = {
  /** Target channel. */
  channel: ChannelId;
  /** Message type. */
  type: OutboundMessageType;
  /** Target recipient/group ID. */
  targetId: string;
  /** Optional thread/topic ID to reply in. */
  threadId?: string;
  /** Text content (for text type). */
  text?: string;
  /** Media URL or path (for image/audio/file types). */
  mediaUrl?: string;
  /** MIME type of attached media. */
  mediaMimeType?: string;
  /** Reaction emoji (for reaction type). */
  reactionEmoji?: string;
  /** Message ID to reply to. */
  replyToMessageId?: string;
  /** Optional account ID for multi-account channels. */
  accountId?: string;
  /** Agent ID that generated this message. */
  agentId?: string;
  /** Session key for routing. */
  sessionKey?: string;
};

// ── Channel Normalizer ───────────────────────────────────────────────────────

/**
 * Interface for channel-specific message normalization.
 *
 * Each channel adapter implements this to convert between its native
 * message format and the unified bus types.
 */
export interface ChannelMessageNormalizer<TInbound = unknown, TOutbound = unknown> {
  /** Convert a channel-native inbound message to unified format. */
  normalizeInbound(raw: TInbound): InboundMessage;
  /** Convert a unified outbound message to channel-native format. */
  denormalizeOutbound(message: OutboundMessage): TOutbound;
}
