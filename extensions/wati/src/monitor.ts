/**
 * WATI webhook handler — receives inbound messages from WATI and dispatches
 * them through the standard reply pipeline.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  createReplyPrefixOptions,
  readJsonBodyWithLimit,
  registerWebhookTarget,
  rejectNonPostWebhookRequest,
  resolveWebhookPath,
  resolveWebhookTargets,
  requestBodyErrorToText,
} from "openclaw/plugin-sdk";
import type { ResolvedWatiAccount } from "./accounts.js";
import { sendWatiMessage } from "./api.js";
import { getWatiRuntime } from "./runtime.js";
import { normalizeE164, isPhoneAllowed } from "./targets.js";
import type { WatiWebhookEvent } from "./types.js";

export type WatiRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export type WatiMonitorOptions = {
  account: ResolvedWatiAccount;
  config: OpenClawConfig;
  runtime: WatiRuntimeEnv;
  abortSignal: AbortSignal;
  webhookPath?: string;
  webhookUrl?: string;
  statusSink?: (patch: {
    lastInboundAt?: number;
    lastOutboundAt?: number;
  }) => void;
};

type WatiCoreRuntime = ReturnType<typeof getWatiRuntime>;

type WebhookTarget = {
  account: ResolvedWatiAccount;
  config: OpenClawConfig;
  runtime: WatiRuntimeEnv;
  core: WatiCoreRuntime;
  path: string;
  statusSink?: (patch: {
    lastInboundAt?: number;
    lastOutboundAt?: number;
  }) => void;
};

const webhookTargets = new Map<string, WebhookTarget[]>();

function logVerbose(
  core: WatiCoreRuntime,
  runtime: WatiRuntimeEnv,
  message: string,
) {
  if (core.logging.shouldLogVerbose()) {
    runtime.log?.(`[wati] ${message}`);
  }
}

export function registerWatiWebhookTarget(target: WebhookTarget): () => void {
  return registerWebhookTarget(webhookTargets, target).unregister;
}

/**
 * Verify WATI webhook request using optional secret.
 * WATI supports a webhook secret that is sent as a query parameter or header.
 */
function verifyWatiWebhook(
  req: IncomingMessage,
  account: ResolvedWatiAccount,
): boolean {
  const secret = account.config.webhookSecret?.trim();
  if (!secret) {
    return true; // No secret configured, allow all
  }
  // WATI sends the secret as x-wati-secret header or ?secret= query param
  const headerSecret = req.headers["x-wati-secret"] as string | undefined;
  if (headerSecret === secret) {
    return true;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const querySecret = url.searchParams.get("secret");
  return querySecret === secret;
}

export async function handleWatiWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const resolved = resolveWebhookTargets(req, webhookTargets);
  if (!resolved) {
    return false;
  }
  const { targets } = resolved;

  if (rejectNonPostWebhookRequest(req, res)) {
    return true;
  }

  const body = await readJsonBodyWithLimit(req, {
    maxBytes: 1024 * 1024,
    timeoutMs: 30_000,
    emptyObjectOnEmpty: false,
  });
  if (!body.ok) {
    res.statusCode =
      body.code === "PAYLOAD_TOO_LARGE"
        ? 413
        : body.code === "REQUEST_BODY_TIMEOUT"
          ? 408
          : 400;
    res.end(
      body.code === "REQUEST_BODY_TIMEOUT"
        ? requestBodyErrorToText("REQUEST_BODY_TIMEOUT")
        : body.error,
    );
    return true;
  }

  const raw = body.value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const event = raw as WatiWebhookEvent;

  // Skip non-message events and bot-owned messages
  if (event.owner === true) {
    res.statusCode = 200;
    res.end("{}");
    return true;
  }

  // Match to the correct account target
  const matchedTargets: WebhookTarget[] = [];
  for (const target of targets) {
    if (verifyWatiWebhook(req, target.account)) {
      matchedTargets.push(target);
      if (matchedTargets.length > 1) break;
    }
  }

  if (matchedTargets.length === 0) {
    res.statusCode = 401;
    res.end("unauthorized");
    return true;
  }

  if (matchedTargets.length > 1) {
    res.statusCode = 401;
    res.end("ambiguous webhook target");
    return true;
  }

  const selected = matchedTargets[0];
  selected.statusSink?.({ lastInboundAt: Date.now() });
  processWatiEvent(event, selected).catch((err) => {
    selected.runtime.error?.(
      `[${selected.account.accountId}] WATI webhook failed: ${String(err)}`,
    );
  });

  // WATI expects 200 immediately — processing is async
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end("{}");
  return true;
}

async function processWatiEvent(
  event: WatiWebhookEvent,
  target: WebhookTarget,
) {
  const { account, config, runtime, core, statusSink } = target;

  // Only process message events
  const eventType = event.eventType ?? "";
  if (eventType && eventType !== "message") {
    logVerbose(core, runtime, `skip non-message event: ${eventType}`);
    return;
  }

  const waId = event.waId?.trim();
  if (!waId) {
    logVerbose(core, runtime, "skip event: missing waId");
    return;
  }

  const senderId = normalizeE164(waId);
  if (!senderId) {
    logVerbose(core, runtime, `skip event: invalid waId "${waId}"`);
    return;
  }

  const senderName = event.senderName?.trim() ?? "";

  // Phone allowlist check
  const dmPolicy = account.config.dm?.policy ?? "pairing";
  const configAllowFrom = (account.config.dm?.allowFrom ?? account.config.allowFrom ?? []).map(
    (v) => String(v),
  );
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(
    event.text ?? "",
    config,
  );
  const storeAllowFrom =
    dmPolicy !== "open" || shouldComputeAuth
      ? await core.channel.pairing
          .readAllowFromStore("wati")
          .catch(() => [])
      : [];
  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];

  if (dmPolicy === "disabled" || account.config.dm?.enabled === false) {
    logVerbose(core, runtime, `blocked WATI DM from ${senderId} (dmPolicy=disabled)`);
    return;
  }

  const senderAllowed = isPhoneAllowed(senderId, effectiveAllowFrom);

  if (dmPolicy !== "open" && !senderAllowed) {
    if (dmPolicy === "pairing") {
      const { code, created } = await core.channel.pairing.upsertPairingRequest({
        channel: "wati",
        id: senderId,
        meta: { name: senderName || undefined },
      });
      if (created) {
        logVerbose(core, runtime, `wati pairing request sender=${senderId}`);
        try {
          await sendWatiMessage({
            account,
            to: senderId,
            text: core.channel.pairing.buildPairingReply({
              channel: "wati",
              idLine: `Your WhatsApp number: ${senderId}`,
              code,
            }),
          });
          statusSink?.({ lastOutboundAt: Date.now() });
        } catch (err) {
          logVerbose(
            core,
            runtime,
            `pairing reply failed for ${senderId}: ${String(err)}`,
          );
        }
      }
    } else {
      logVerbose(
        core,
        runtime,
        `blocked unauthorized WATI sender ${senderId} (dmPolicy=${dmPolicy})`,
      );
    }
    return;
  }

  // Build message text
  const messageText = (event.text ?? "").trim();
  const hasMedia =
    event.type !== "text" &&
    event.type !== undefined &&
    event.data?.url;
  const rawBody =
    messageText || (hasMedia ? `<media:${event.type ?? "attachment"}>` : "");
  if (!rawBody) {
    return;
  }

  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [
          {
            configured: effectiveAllowFrom.length > 0,
            allowed: senderAllowed,
          },
        ],
      })
    : undefined;

  if (
    core.channel.commands.isControlCommandMessage(rawBody, config) &&
    commandAuthorized !== true
  ) {
    logVerbose(core, runtime, `wati: drop control command from ${senderId}`);
    return;
  }

  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "wati",
    accountId: account.accountId,
    peer: { kind: "direct", id: senderId },
  });

  // Handle media attachments
  let mediaPath: string | undefined;
  let mediaType: string | undefined;
  if (hasMedia && event.data?.url) {
    try {
      const maxBytes = (account.config.mediaMaxMb ?? 20) * 1024 * 1024;
      const loaded = await core.channel.media.fetchRemoteMedia({
        url: event.data.url,
        maxBytes,
      });
      const saved = await core.channel.media.saveMediaBuffer(
        loaded.buffer,
        loaded.contentType ?? event.data.mimeType,
        "inbound",
        maxBytes,
        event.data.fileName,
      );
      mediaPath = saved.path;
      mediaType = saved.contentType;
    } catch (err) {
      runtime.error?.(`[wati] media download failed: ${String(err)}`);
    }
  }

  const fromLabel = senderName || senderId;
  const storePath = core.channel.session.resolveStorePath(
    config.session?.store,
    { agentId: route.agentId },
  );
  const envelopeOptions =
    core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "WATI WhatsApp",
    from: fromLabel,
    timestamp: event.timestamp ? Number(event.timestamp) * 1000 : undefined,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `wati:${senderId}`,
    To: `wati:${account.config.channelPhoneNumber ?? account.accountId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: fromLabel,
    SenderName: senderName || undefined,
    SenderId: senderId,
    CommandAuthorized: commandAuthorized,
    Provider: "wati",
    Surface: "wati",
    MessageSid: event.whatsappMessageId ?? event.id,
    MessageSidFull: event.whatsappMessageId ?? event.id,
    MediaPath: mediaPath,
    MediaType: mediaType,
    MediaUrl: mediaPath,
    OriginatingChannel: "wati",
    OriginatingTo: `wati:${account.accountId}`,
  });

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
    })
    .catch((err) => {
      runtime.error?.(
        `wati: failed updating session meta: ${String(err)}`,
      );
    });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config,
    agentId: route.agentId,
    channel: "wati",
    accountId: route.accountId,
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        await deliverWatiReply({
          payload,
          account,
          senderId,
          runtime,
          core,
          config,
          statusSink,
        });
      },
      onError: (err, info) => {
        runtime.error?.(
          `[${account.accountId}] WATI ${info.kind} reply failed: ${String(err)}`,
        );
      },
    },
    replyOptions: {
      onModelSelected,
    },
  });
}

async function deliverWatiReply(params: {
  payload: {
    text?: string;
    mediaUrls?: string[];
    mediaUrl?: string;
    replyToId?: string;
  };
  account: ResolvedWatiAccount;
  senderId: string;
  runtime: WatiRuntimeEnv;
  core: WatiCoreRuntime;
  config: OpenClawConfig;
  statusSink?: (patch: {
    lastInboundAt?: number;
    lastOutboundAt?: number;
  }) => void;
}): Promise<void> {
  const { payload, account, senderId, runtime, core, config, statusSink } =
    params;

  // Handle media
  const mediaList = payload.mediaUrls?.length
    ? payload.mediaUrls
    : payload.mediaUrl
      ? [payload.mediaUrl]
      : [];

  if (mediaList.length > 0) {
    const { sendWatiMedia } = await import("./api.js");
    for (const mediaUrl of mediaList) {
      try {
        await sendWatiMedia({
          account,
          to: senderId,
          mediaUrl,
          caption: payload.text,
        });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error?.(`WATI media send failed: ${String(err)}`);
      }
    }
    return;
  }

  // Handle text
  if (payload.text) {
    const chunkLimit = account.config.textChunkLimit ?? 4000;
    const chunkMode = core.channel.text.resolveChunkMode(
      config,
      "wati",
      account.accountId,
    );
    const chunks = core.channel.text.chunkMarkdownTextWithMode(
      payload.text,
      chunkLimit,
      chunkMode,
    );
    for (const chunk of chunks) {
      try {
        await sendWatiMessage({ account, to: senderId, text: chunk });
        statusSink?.({ lastOutboundAt: Date.now() });
      } catch (err) {
        runtime.error?.(`WATI message send failed: ${String(err)}`);
      }
    }
  }
}

export function monitorWatiProvider(options: WatiMonitorOptions): () => void {
  const core = getWatiRuntime();
  const webhookPath = resolveWebhookPath({
    webhookPath: options.webhookPath,
    webhookUrl: options.webhookUrl,
    defaultPath: "/wati",
  });
  if (!webhookPath) {
    options.runtime.error?.(
      `[${options.account.accountId}] invalid webhook path`,
    );
    return () => {};
  }

  const unregister = registerWatiWebhookTarget({
    account: options.account,
    config: options.config,
    runtime: options.runtime,
    core,
    path: webhookPath,
    statusSink: options.statusSink,
  });

  return unregister;
}

export async function startWatiMonitor(
  params: WatiMonitorOptions,
): Promise<() => void> {
  return monitorWatiProvider(params);
}

export function resolveWatiWebhookPath(params: {
  account: ResolvedWatiAccount;
}): string {
  return (
    resolveWebhookPath({
      webhookPath: params.account.config.webhookPath,
      webhookUrl: params.account.config.webhookUrl,
      defaultPath: "/wati",
    }) ?? "/wati"
  );
}
