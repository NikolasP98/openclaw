/**
 * WATI API client for outbound messaging.
 *
 * Endpoints:
 * - POST /api/v1/sendsessionmessage/{whatsappnumber} — send text to open session
 * - POST /api/ext/v3/conversations/messages/text — send text (v3)
 *
 * Auth: Bearer token via "Authorization" header.
 */

import type { ResolvedWatiAccount } from "./accounts.js";
import type { WatiSendTextResponse } from "./types.js";
import { normalizeE164 } from "./targets.js";

export async function sendWatiMessage(params: {
  account: ResolvedWatiAccount;
  to: string;
  text: string;
}): Promise<{ ok: boolean; info?: string }> {
  const { account, to, text } = params;
  const apiUrl = account.apiUrl;
  const apiToken = account.apiToken;
  if (!apiUrl || !apiToken) {
    throw new Error("WATI API URL or token not configured");
  }

  // Strip "+" from E.164 for WATI API (expects bare digits)
  const phone = normalizeE164(to).replace(/^\+/, "");
  if (!phone) {
    throw new Error(`Invalid WATI target: ${to}`);
  }

  const url = `${apiUrl.replace(/\/$/, "")}/api/v1/sendSessionMessage/${phone}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messageText: text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`WATI API error ${response.status}: ${body}`);
  }

  const result = (await response.json()) as WatiSendTextResponse;
  return { ok: result.result !== false, info: result.info };
}

export async function sendWatiMedia(params: {
  account: ResolvedWatiAccount;
  to: string;
  mediaUrl: string;
  caption?: string;
  fileName?: string;
}): Promise<{ ok: boolean; info?: string }> {
  const { account, to, mediaUrl, caption, fileName } = params;
  const apiUrl = account.apiUrl;
  const apiToken = account.apiToken;
  if (!apiUrl || !apiToken) {
    throw new Error("WATI API URL or token not configured");
  }

  const phone = normalizeE164(to).replace(/^\+/, "");
  if (!phone) {
    throw new Error(`Invalid WATI target: ${to}`);
  }

  // Use session file endpoint for media
  const url = `${apiUrl.replace(/\/$/, "")}/api/v1/sendSessionFile/${phone}`;
  const body = new FormData();
  // Fetch the media and attach it
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    throw new Error(`Failed to fetch media: ${mediaResponse.status}`);
  }
  const blob = await mediaResponse.blob();
  body.append("file", blob, fileName ?? "attachment");
  if (caption) {
    body.append("caption", caption);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body,
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(`WATI API error ${response.status}: ${responseBody}`);
  }

  const result = (await response.json()) as WatiSendTextResponse;
  return { ok: result.result !== false, info: result.info };
}

export async function probeWati(account: ResolvedWatiAccount): Promise<{
  ok: boolean;
  error?: string;
}> {
  const apiUrl = account.apiUrl;
  const apiToken = account.apiToken;
  if (!apiUrl || !apiToken) {
    return { ok: false, error: "API URL or token not configured" };
  }

  try {
    const url = `${apiUrl.replace(/\/$/, "")}/api/v1/getContacts`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
