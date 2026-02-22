/**
 * WhatsApp XML message batching — format multiple messages into a single
 * XML-structured payload for group delivery.
 *
 * WhatsApp Business API supports XML-like formatting for rich messages.
 * This module batches multiple agent messages into a single formatted
 * payload with proper XML escaping.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type GroupMessage = {
  /** Sender display name. */
  sender: string;
  /** Message text content. */
  text: string;
  /** ISO timestamp. */
  timestamp?: string;
};

// ── XML Escaping ─────────────────────────────────────────────────────────────

const XML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Escape special XML characters in a string.
 */
export function escapeXml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => XML_ESCAPE_MAP[ch] ?? ch);
}

// ── Batching ─────────────────────────────────────────────────────────────────

/**
 * Format an array of messages into a single XML-structured batch string.
 *
 * Output format:
 * ```xml
 * <messages>
 *   <message sender="Agent" timestamp="2025-01-01T00:00:00Z">
 *     Hello world
 *   </message>
 * </messages>
 * ```
 *
 * Empty messages are skipped. Returns empty string if no valid messages.
 */
export function formatGroupMessages(messages: GroupMessage[]): string {
  const validMessages = messages.filter((m) => m.text.trim().length > 0);

  if (validMessages.length === 0) {
    return "";
  }

  const lines: string[] = ["<messages>"];

  for (const msg of validMessages) {
    const attrs: string[] = [`sender="${escapeXml(msg.sender)}"`];
    if (msg.timestamp) {
      attrs.push(`timestamp="${escapeXml(msg.timestamp)}"`);
    }
    lines.push(`  <message ${attrs.join(" ")}>`);
    lines.push(`    ${escapeXml(msg.text)}`);
    lines.push("  </message>");
  }

  lines.push("</messages>");
  return lines.join("\n");
}

/**
 * Format messages as a simple plain-text batch (fallback for non-XML channels).
 *
 * Output format:
 * ```
 * [Agent] Hello world
 * [Bot] How can I help?
 * ```
 */
export function formatGroupMessagesPlainText(messages: GroupMessage[]): string {
  return messages
    .filter((m) => m.text.trim().length > 0)
    .map((m) => `[${m.sender}] ${m.text}`)
    .join("\n");
}
