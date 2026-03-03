import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { buildAgentMainSessionKey, normalizeAgentId } from "../routing/session-key.js";

export function getHeader(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return undefined;
}

export function getBearerToken(req: IncomingMessage): string | undefined {
  const raw = getHeader(req, "authorization")?.trim() ?? "";
  if (!raw.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }
  const token = raw.slice(7).trim();
  return token || undefined;
}

export function resolveAgentIdFromHeader(req: IncomingMessage): string | undefined {
  const raw =
    getHeader(req, "x-minion-agent-id")?.trim() || getHeader(req, "x-minion-agent")?.trim() || "";
  if (!raw) {
    return undefined;
  }
  return normalizeAgentId(raw);
}

export function resolveAgentIdFromModel(model: string | undefined): string | undefined {
  const raw = model?.trim();
  if (!raw) {
    return undefined;
  }

  const m =
    raw.match(/^minion[:/](?<agentId>[a-z0-9][a-z0-9_-]{0,63})$/i) ??
    raw.match(/^agent:(?<agentId>[a-z0-9][a-z0-9_-]{0,63})$/i);
  const agentId = m?.groups?.agentId;
  if (!agentId) {
    return undefined;
  }
  return normalizeAgentId(agentId);
}

export function resolveAgentIdForRequest(params: {
  req: IncomingMessage;
  model: string | undefined;
}): string {
  const fromHeader = resolveAgentIdFromHeader(params.req);
  if (fromHeader) {
    return fromHeader;
  }

  const fromModel = resolveAgentIdFromModel(params.model);
  return fromModel ?? "main";
}

/**
 * Derive a stable 8-character session ID suffix from message content.
 *
 * Used as a fallback when no explicit session key or user field is provided.
 * Produces the same ID for the same opening message, enabling consistent
 * session pinning for OpenAI-compatible clients that don't send session headers.
 *
 * Sprint U.1 — ClawRouter v0.10.16 pattern (commit 9fb30af).
 */
export function deriveSessionIdFromContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

export function resolveSessionKey(params: {
  req: IncomingMessage;
  agentId: string;
  user?: string | undefined;
  prefix: string;
  /** Optional: first user message content for stable session ID derivation (Sprint U.1). */
  firstUserMessageContent?: string | undefined;
}): string {
  const explicit = getHeader(params.req, "x-minion-session-key")?.trim();
  if (explicit) {
    return explicit;
  }

  const user = params.user?.trim();
  if (user) {
    return buildAgentMainSessionKey({
      agentId: params.agentId,
      mainKey: `${params.prefix}-user:${user}`,
    });
  }

  // U.1: Derive stable session ID from first user message content when available.
  // Same opening message = same session key = consistent session pinning.
  const firstContent = params.firstUserMessageContent?.trim();
  const sessionSuffix = firstContent
    ? deriveSessionIdFromContent(firstContent)
    : randomUUID();

  return buildAgentMainSessionKey({
    agentId: params.agentId,
    mainKey: `${params.prefix}:${sessionSuffix}`,
  });
}
