/**
 * Feishu/Lark channel adapter — core types and message normalization.
 *
 * Feishu (飞书) is Bytedance's enterprise messaging platform (~500M users).
 * Lark is the international version. Both share the same API but use
 * different domains (feishu.cn vs lark.suite.com).
 *
 * This module defines the adapter interface and message normalization.
 * The full SDK integration (WebSocket events, streaming cards, media upload)
 * requires `@larksuiteoapi/node-sdk` and is wired separately.
 *
 * Ported from jiulingyun/openclaw-cn's 20-file Feishu implementation.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("channels/feishu");

// ── Types ────────────────────────────────────────────────────────────

export type FeishuDomain = "feishu" | "lark";

export interface FeishuConfig {
  /** App ID from Feishu/Lark developer console. */
  appId: string;
  /** App Secret. */
  appSecret: string;
  /** Which domain to use. */
  domain: FeishuDomain;
  /** Verification token for event callbacks. */
  verificationToken?: string;
  /** Encrypt key for event callbacks. */
  encryptKey?: string;
  /** Allowed user IDs (empty = allow all authenticated users). */
  allowFrom?: string[];
}

export interface FeishuInboundMessage {
  /** Feishu message ID. */
  messageId: string;
  /** Chat ID (group or P2P). */
  chatId: string;
  /** Chat type. */
  chatType: "p2p" | "group";
  /** Sender's open_id. */
  senderId: string;
  /** Sender's display name. */
  senderName?: string;
  /** Message content (plain text extracted from Feishu's rich text format). */
  content: string;
  /** Original Feishu message type (text, post, image, etc.). */
  messageType: string;
  /** Timestamp (ms). */
  timestamp: number;
  /** Whether this is a mention of the bot. */
  isMention: boolean;
  /** Raw event data for advanced processing. */
  rawEvent?: Record<string, unknown>;
}

export interface FeishuOutboundMessage {
  chatId: string;
  content: string;
  /** Optional: reply to a specific message. */
  replyToMessageId?: string;
  /** Whether to use streaming card format. */
  streaming?: boolean;
}

// ── Domain resolution ────────────────────────────────────────────────

const DOMAIN_URLS: Record<FeishuDomain, { api: string; open: string }> = {
  feishu: {
    api: "https://open.feishu.cn",
    open: "https://open.feishu.cn",
  },
  lark: {
    api: "https://open.larksuite.com",
    open: "https://open.larksuite.com",
  },
};

export function resolveApiBaseUrl(domain: FeishuDomain): string {
  return DOMAIN_URLS[domain].api;
}

// ── Message content extraction ───────────────────────────────────────

/**
 * Extract plain text from Feishu's rich message format.
 *
 * Feishu messages come as JSON with a `content` field that varies by type:
 * - text: `{"text": "hello"}`
 * - post: `{"title": "...", "content": [[{"tag":"text","text":"..."}]]}`
 * - image/file/etc: metadata only
 */
export function extractTextContent(messageType: string, rawContent: string): string {
  try {
    const parsed = JSON.parse(rawContent) as Record<string, unknown>;

    if (messageType === "text") {
      return (parsed.text as string) ?? "";
    }

    if (messageType === "post") {
      return extractPostText(parsed);
    }

    // For non-text types, return a description.
    if (messageType === "image") return "[Image]";
    if (messageType === "file") return "[File]";
    if (messageType === "audio") return "[Voice Message]";
    if (messageType === "video") return "[Video]";
    if (messageType === "sticker") return "[Sticker]";
    if (messageType === "interactive") return "[Interactive Card]";

    return `[${messageType}]`;
  } catch {
    return rawContent;
  }
}

function extractPostText(parsed: Record<string, unknown>): string {
  const title = parsed.title as string | undefined;
  const content = parsed.content as Array<Array<{ tag: string; text?: string }>> | undefined;
  const lines: string[] = [];
  if (title) lines.push(title);
  if (content) {
    for (const paragraph of content) {
      const texts = paragraph
        .filter((el) => el.tag === "text" && el.text)
        .map((el) => el.text!);
      if (texts.length > 0) lines.push(texts.join(""));
    }
  }
  return lines.join("\n");
}

// ── Streaming card helpers ───────────────────────────────────────────

/**
 * Feishu's Card Kit API supports streaming updates via sequence-numbered
 * patches. This is architecturally cleaner than Telegram/Slack's
 * edit-in-place approach.
 */

export interface StreamingCardState {
  cardId: string;
  sequenceNo: number;
  uuid: string;
}

export function createStreamingCardState(cardId: string): StreamingCardState {
  return {
    cardId,
    sequenceNo: 0,
    uuid: `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}

/**
 * Build the next streaming update payload.
 * Each update increments the sequence number for idempotent delivery.
 */
export function buildStreamingUpdate(state: StreamingCardState, text: string): {
  payload: { card_id: string; sequence: number; uuid: string; content: string };
  nextState: StreamingCardState;
} {
  const nextSeq = state.sequenceNo + 1;
  return {
    payload: {
      card_id: state.cardId,
      sequence: nextSeq,
      uuid: state.uuid,
      content: text,
    },
    nextState: { ...state, sequenceNo: nextSeq },
  };
}
