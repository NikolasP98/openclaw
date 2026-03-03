import type { MinionConfig } from "../config/config.js";

/**
 * Permission tier for a session sender:
 * - "admin":  Listed in cfg.admins[] — global, applies to all agents.
 * - "owner":  Listed in cfg.agents.list[n].owners[] — per-agent.
 * - "user":   Authorized by the existing pairing/allowFrom gate but not in admins/owners.
 * - "none":   Not authorized (blocked by DM gate before reaching any agent).
 */
export type PermissionLevel = "none" | "user" | "owner" | "admin";

/**
 * Strip a channel prefix from a peer ID entry.
 * "whatsapp:+51922286663" → "+51922286663"
 * "telegram:@nikolas"     → "telegram:@nikolas"  (telegram: IS part of the id)
 * "discord:user:123"      → "user:123"            (discord: prefix stripped)
 * "signal:+15551234567"   → "+15551234567"
 */
function stripChannelPrefix(raw: string): string {
  // Only strip prefixes for channels where the prefix is NOT part of the canonical id.
  // WhatsApp, Signal, SMS: canonical IDs are E164 numbers — strip the channel prefix.
  // Telegram, Discord: canonical IDs include their own prefix (telegram:, user:).
  const STRIPPABLE_PREFIXES = ["whatsapp:", "signal:", "sms:"] as const;
  const lower = raw.toLowerCase();
  for (const prefix of STRIPPABLE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return raw.slice(prefix.length).trim();
    }
  }
  return raw;
}

/**
 * Normalize a single peer ID string for comparison:
 * - Trim whitespace
 * - Strip @s.whatsapp.net suffix (WhatsApp JID format)
 * - Lower-case (so "+51..." stays "+51...", "telegram:@User" → "telegram:@user")
 */
function normalizePeerId(raw: string): string {
  return raw
    .trim()
    .replace(/@s\.whatsapp\.net$/i, "")
    .toLowerCase();
}

/**
 * Expand a list of peer ID entries (which may contain identity link names) into
 * a Set of normalized peer ID strings ready for direct comparison.
 */
function expandAndNormalize(
  entries: string[],
  identityLinks: Record<string, string[]>,
): Set<string> {
  const result = new Set<string>();
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    // Check if this entry is an identity link name (not a peer id or channel-prefixed id).
    // Identity link names are short strings without "+", ":", or "@".
    if (identityLinks[trimmed]) {
      for (const linked of identityLinks[trimmed]) {
        result.add(normalizePeerId(stripChannelPrefix(linked)));
      }
      continue;
    }

    result.add(normalizePeerId(stripChannelPrefix(trimmed)));
  }
  return result;
}

/**
 * Resolve the permission level for a sender, given the full config and the
 * list of normalized sender ID candidates (from the channel auth layer).
 *
 * @param senderCandidates  Normalized sender IDs already produced by command-auth
 *                          (may include E164, telegram:@..., user:..., etc.)
 * @param agentId           Current agent being addressed
 * @param cfg               Full OpenClaw config
 * @param isAuthorizedSender Whether the sender passed the existing DM/pairing gate
 */
export function resolvePermissionLevel(params: {
  senderCandidates: string[];
  agentId?: string;
  cfg: MinionConfig;
  isAuthorizedSender: boolean;
}): PermissionLevel {
  const { senderCandidates, agentId, cfg, isAuthorizedSender } = params;

  if (senderCandidates.length === 0 && !isAuthorizedSender) {
    return "none";
  }

  const identityLinks = cfg.session?.identityLinks ?? {};
  const normalizedSenders = senderCandidates.map((c) => normalizePeerId(stripChannelPrefix(c)));

  // --- Admin check (global) ---
  if ((cfg.admins ?? []).length > 0) {
    const adminSet = expandAndNormalize(cfg.admins ?? [], identityLinks);
    if (normalizedSenders.some((s) => adminSet.has(s))) {
      return "admin";
    }
  }

  // --- Owner check (per-agent) ---
  if (agentId) {
    const agentConfig = cfg.agents?.list?.find((a) => a.id === agentId);
    if (agentConfig?.owners && agentConfig.owners.length > 0) {
      const ownerSet = expandAndNormalize(agentConfig.owners, identityLinks);
      if (normalizedSenders.some((s) => ownerSet.has(s))) {
        return "owner";
      }
    }
  }

  // --- User check (existing pairing/allowFrom gate) ---
  if (isAuthorizedSender) {
    return "user";
  }

  return "none";
}
