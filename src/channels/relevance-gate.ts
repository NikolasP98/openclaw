/**
 * Relevance gate for multi-bot group conversations.
 *
 * When `responseMode: "relevant"` is configured, this module decides whether
 * an agent should respond to a group message based on keyword matching against
 * the agent's declared capabilities.
 *
 * Anti-loop safety: messages from other bots are always skipped unless
 * the bot was explicitly @mentioned.
 */

export type RelevanceGateParams = {
  /** The message text to evaluate. */
  text: string;
  /** Keywords from the agent's `capabilities.keywords` config. */
  keywords: string[];
  /** Whether the sender is a bot (Telegram `from.is_bot`). */
  isFromBot: boolean;
  /** Whether this bot was explicitly @mentioned in the message. */
  wasMentioned: boolean;
};

export type RelevanceGateReason = "mentioned" | "keyword-match" | "no-match" | "bot-no-mention";

export type RelevanceGateResult = {
  shouldRespond: boolean;
  reason: RelevanceGateReason;
};

/**
 * Evaluate whether the agent should respond to a group message in "relevant" mode.
 *
 * Priority:
 * 1. If explicitly @mentioned → always respond
 * 2. If sender is a bot and not @mentioned → skip (anti-loop)
 * 3. If any keyword matches the message text → respond
 * 4. Otherwise → skip
 */
export function resolveRelevanceGate(params: RelevanceGateParams): RelevanceGateResult {
  // Always respond when explicitly mentioned
  if (params.wasMentioned) {
    return { shouldRespond: true, reason: "mentioned" };
  }

  // Anti-loop: never auto-respond to bot messages without explicit @mention
  if (params.isFromBot) {
    return { shouldRespond: false, reason: "bot-no-mention" };
  }

  // Check keyword relevance against message text
  if (params.keywords.length > 0 && params.text) {
    const textLower = params.text.toLowerCase();
    const matched = params.keywords.some((kw) => {
      const kwLower = kw.toLowerCase().trim();
      if (!kwLower) {
        return false;
      }
      // Word-boundary match to avoid false positives on partial substrings.
      // Only apply \b at edges where the keyword character is a word char (\w),
      // since \b doesn't trigger between two non-word characters.
      const escaped = escapeForRegex(kwLower);
      const prefix = /^\w/.test(kwLower) ? "\\b" : "";
      const suffix = /\w$/.test(kwLower) ? "\\b" : "";
      const re = new RegExp(`${prefix}${escaped}${suffix}`, "i");
      return re.test(textLower);
    });
    if (matched) {
      return { shouldRespond: true, reason: "keyword-match" };
    }
  }

  return { shouldRespond: false, reason: "no-match" };
}

function escapeForRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
