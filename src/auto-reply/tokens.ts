import { escapeRegExp } from "../utils.js";

export const HEARTBEAT_TOKEN = "HEARTBEAT_OK";
export const SILENT_REPLY_TOKEN = "NO_REPLY";

// Cache compiled regexes keyed by the escaped token string — avoids re-creating
// `new RegExp()` on every `isSilentReplyText` call.
const silentPrefixCache = new Map<string, RegExp>();
const silentSuffixCache = new Map<string, RegExp>();

export function isSilentReplyText(
  text: string | undefined,
  token: string = SILENT_REPLY_TOKEN,
): boolean {
  if (!text) {
    return false;
  }
  const escaped = escapeRegExp(token);

  let prefix = silentPrefixCache.get(escaped);
  if (!prefix) {
    prefix = new RegExp(`^\\s*${escaped}(?=$|\\W)`);
    silentPrefixCache.set(escaped, prefix);
  }
  if (prefix.test(text)) {
    return true;
  }

  let suffix = silentSuffixCache.get(escaped);
  if (!suffix) {
    suffix = new RegExp(`\\b${escaped}\\b\\W*$`);
    silentSuffixCache.set(escaped, suffix);
  }
  return suffix.test(text);
}
