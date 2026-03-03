/**
 * WATI webhook payload types.
 *
 * Reference: https://docs.wati.io/reference/message-received
 */

export type WatiWebhookEvent = {
  id?: string;
  created?: string;
  whatsappMessageId?: string;
  conversationId?: string;
  ticketId?: string;
  text?: string;
  type?: WatiMessageType;
  data?: WatiMediaData | null;
  sourceId?: string | null;
  sourceUrl?: string | null;
  timestamp?: string;
  owner?: boolean;
  eventType?: string;
  statusString?: string;
  avatarUrl?: string | null;
  assignedId?: string;
  operatorName?: string;
  operatorEmail?: string;
  waId?: string;
  messageContact?: Record<string, unknown> | null;
  senderName?: string;
  listReply?: WatiListReply | null;
  interactiveButtonReply?: WatiButtonReply | null;
  buttonReply?: WatiButtonReply | null;
  replyContextId?: string;
  sourceType?: number;
  frequentlyForwarded?: boolean;
  forwarded?: boolean;
  channelId?: string | null;
  channelPhoneNumber?: string;
};

export type WatiMessageType =
  | "text"
  | "image"
  | "document"
  | "location"
  | "voice"
  | "audio"
  | "button"
  | "interactive"
  | "reaction"
  | "video"
  | "sticker"
  | "contacts"
  | "order"
  | "catalog"
  | "media_placeholder";

export type WatiMediaData = {
  url?: string;
  caption?: string;
  mimeType?: string;
  fileName?: string;
};

export type WatiListReply = {
  title?: string;
  id?: string;
  description?: string;
};

export type WatiButtonReply = {
  id?: string;
  title?: string;
};

/**
 * WATI Send Message API types.
 *
 * Reference: https://docs.wati.io/reference/introduction-1
 */

export type WatiSendTextRequest = {
  messageText: string;
};

export type WatiSendTextResponse = {
  result?: boolean;
  info?: string;
};

export type WatiAccountConfig = {
  enabled?: boolean;
  name?: string;
  apiUrl?: string;
  apiToken?: string;
  webhookPath?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  allowFrom?: Array<string | number>;
  dm?: {
    policy?: "open" | "pairing" | "allowlist" | "disabled";
    allowFrom?: Array<string | number>;
    enabled?: boolean;
  };
  groupPolicy?: "open" | "allowlist" | "disabled";
  groups?: Record<
    string,
    {
      requireMention?: boolean;
      allow?: boolean;
      enabled?: boolean;
      users?: Array<string | number>;
      systemPrompt?: string;
    }
  >;
  groupAllowFrom?: Array<string | number>;
  channelPhoneNumber?: string;
  typingIndicator?: "message" | "none";
  textChunkLimit?: number;
  mediaMaxMb?: number;
};

export type WatiConfig = {
  enabled?: boolean;
  defaultAccount?: string;
  accounts?: Record<string, WatiAccountConfig>;
} & WatiAccountConfig;
