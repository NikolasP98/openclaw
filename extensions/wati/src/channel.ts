import {
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  missingTargetError,
  normalizeAccountId,
  type ChannelPlugin,
  type ChannelStatusIssue,
  type MinionConfig,
} from "minion/plugin-sdk";
import {
  listWatiAccountIds,
  resolveDefaultWatiAccountId,
  resolveWatiAccount,
  type ResolvedWatiAccount,
} from "./accounts.js";
import { sendWatiMessage, probeWati } from "./api.js";
import { resolveWatiWebhookPath, startWatiMonitor } from "./monitor.js";
import { getWatiRuntime } from "./runtime.js";
import {
  normalizeE164,
  normalizeWatiTarget,
  looksLikeWatiTarget,
  isPhoneAllowed,
} from "./targets.js";

export const watiPlugin: ChannelPlugin<ResolvedWatiAccount> = {
  id: "wati",
  meta: {
    id: "wati",
    label: "WATI WhatsApp",
    selectionLabel: "WATI (WhatsApp Business API)",
    detailLabel: "WATI WhatsApp Business",
    docsPath: "/channels/wati",
    docsLabel: "wati",
    blurb:
      "WhatsApp Business API via WATI — webhook-based, popular in LATAM & SEA.",
    systemImage: "message",
    aliases: ["wati-whatsapp", "whatsapp-business"],
  },
  pairing: {
    idLabel: "watiSenderId",
    normalizeAllowEntry: (entry) => normalizeE164(entry),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveWatiAccount({ cfg });
      if (!account.apiUrl || !account.apiToken) return;
      const target = normalizeWatiTarget(id) ?? id;
      await sendWatiMessage({
        account,
        to: target,
        text: "Your pairing request has been approved. You can now send messages.",
      });
    },
  },
  capabilities: {
    chatTypes: ["direct"],
    media: true,
    blockStreaming: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.wati"] },
  config: {
    listAccountIds: (cfg) => listWatiAccountIds(cfg),
    resolveAccount: (cfg, accountId) =>
      resolveWatiAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultWatiAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const accountKey = accountId || DEFAULT_ACCOUNT_ID;
      const channels = cfg.channels as Record<string, unknown>;
      const wati = (channels?.wati ?? {}) as Record<string, unknown>;
      const accounts = (wati.accounts ?? {}) as Record<string, unknown>;
      const existing = (accounts[accountKey] ?? {}) as Record<string, unknown>;
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          wati: {
            ...wati,
            accounts: {
              ...accounts,
              [accountKey]: { ...existing, enabled },
            },
          },
        },
      } as MinionConfig;
    },
    deleteAccount: ({ cfg, accountId }) => {
      const accountKey = accountId || DEFAULT_ACCOUNT_ID;
      const channels = cfg.channels as Record<string, unknown>;
      const wati = (channels?.wati ?? {}) as Record<string, unknown>;
      const accounts = { ...((wati.accounts ?? {}) as Record<string, unknown>) };
      delete accounts[accountKey];
      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          wati: {
            ...wati,
            accounts: Object.keys(accounts).length ? accounts : undefined,
          },
        },
      } as MinionConfig;
    },
    isConfigured: (account) =>
      Boolean(account.apiUrl?.trim() && account.apiToken?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.apiUrl && account.apiToken),
      apiUrl: account.apiUrl ? "configured" : "missing",
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = resolveWatiAccount({ cfg, accountId });
      return (account.config.dm?.allowFrom ?? account.config.allowFrom ?? []).map(
        (v) => String(v),
      );
    },
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => (entry === "*" ? entry : normalizeE164(entry)))
        .filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId =
        accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const watiSection = (cfg.channels as Record<string, unknown>)?.wati as
        | { accounts?: Record<string, unknown> }
        | undefined;
      const useAccountPath = Boolean(
        watiSection?.accounts?.[resolvedAccountId],
      );
      const allowFromPath = useAccountPath
        ? `channels.wati.accounts.${resolvedAccountId}.dm.`
        : "channels.wati.dm.";
      return {
        policy: account.config.dm?.policy ?? "pairing",
        allowFrom: account.config.dm?.allowFrom ?? account.config.allowFrom ?? [],
        allowFromPath,
        approveHint: formatPairingApproveHint("wati"),
        normalizeEntry: (raw: string) => normalizeE164(raw),
      };
    },
    collectWarnings: ({ account }) => {
      const warnings: string[] = [];
      if (account.config.dm?.policy === "open") {
        warnings.push(
          `- WATI DMs are open to anyone. Set channels.wati.dm.policy="pairing" or "allowlist".`,
        );
      }
      if (!account.apiUrl || !account.apiToken) {
        warnings.push(
          `- WATI API credentials not configured. Set channels.wati.apiUrl and channels.wati.apiToken.`,
        );
      }
      return warnings;
    },
  },
  messaging: {
    normalizeTarget: (raw: string) => normalizeWatiTarget(raw) ?? undefined,
    targetResolver: {
      looksLikeId: (raw) => looksLikeWatiTarget(raw),
      hint: "<E.164 phone number>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveWatiAccount({ cfg, accountId });
      const q = query?.trim().toLowerCase() || "";
      const allowFrom = account.config.dm?.allowFrom ?? account.config.allowFrom ?? [];
      const peers = Array.from(
        new Set(
          allowFrom
            .map((entry) => String(entry).trim())
            .filter((entry) => Boolean(entry) && entry !== "*")
            .map((entry) => normalizeE164(entry))
            .filter(Boolean),
        ),
      )
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "user", id }) as const);
      return peers;
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) =>
      getWatiRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to, allowFrom, mode }) => {
      const trimmed = to?.trim() ?? "";
      if (!trimmed) {
        return {
          ok: false,
          error: missingTargetError("WATI", "<E.164 phone number>"),
        };
      }
      const normalized = normalizeWatiTarget(trimmed);
      if (!normalized) {
        return {
          ok: false,
          error: missingTargetError("WATI", "<E.164 phone number>"),
        };
      }

      // Check allowlist in implicit mode
      if (mode === "implicit" && allowFrom) {
        if (!isPhoneAllowed(normalized, allowFrom)) {
          return {
            ok: false,
            error: new Error(`target not allowlisted: ${normalized}`),
          };
        }
      }

      return { ok: true, to: normalized };
    },
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveWatiAccount({ cfg, accountId });
      const result = await sendWatiMessage({ account, to, text });
      return {
        channel: "wati",
        messageId: "",
        chatId: to,
        ok: result.ok,
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
      if (!mediaUrl) {
        throw new Error("WATI mediaUrl is required.");
      }
      const account = resolveWatiAccount({ cfg, accountId });
      const { sendWatiMedia } = await import("./api.js");
      const result = await sendWatiMedia({
        account,
        to,
        mediaUrl,
        caption: text,
      });
      return {
        channel: "wati",
        messageId: "",
        chatId: to,
        ok: result.ok,
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts): ChannelStatusIssue[] =>
      accounts.flatMap((entry) => {
        const accountId = String(entry.accountId ?? DEFAULT_ACCOUNT_ID);
        const enabled = entry.enabled !== false;
        const configured = entry.configured === true;
        if (!enabled || !configured) return [];
        const issues: ChannelStatusIssue[] = [];
        const snapshot = entry as Record<string, unknown>;
        if (!snapshot.apiUrl || snapshot.apiUrl === "missing") {
          issues.push({
            channel: "wati",
            accountId,
            kind: "config",
            message:
              "WATI API URL is missing (set channels.wati.apiUrl or WATI_API_URL env).",
            fix: "Set channels.wati.apiUrl to your WATI instance URL.",
          });
        }
        return issues;
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      webhookPath: snapshot.webhookPath ?? null,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account }) => probeWati(account),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.apiUrl && account.apiToken),
      apiUrl: account.apiUrl ? "configured" : "missing",
      webhookPath: account.config.webhookPath,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
      dmPolicy: account.config.dm?.policy ?? "pairing",
      probe,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info(
        `[${account.accountId}] starting WATI webhook listener`,
      );
      ctx.setStatus({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
        webhookPath: resolveWatiWebhookPath({ account }),
      });
      const unregister = await startWatiMonitor({
        account,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        webhookPath: account.config.webhookPath,
        webhookUrl: account.config.webhookUrl,
        statusSink: (patch) =>
          ctx.setStatus({ accountId: account.accountId, ...patch }),
      });
      return () => {
        unregister?.();
        ctx.setStatus({
          accountId: account.accountId,
          running: false,
          lastStopAt: Date.now(),
        });
      };
    },
  },
};
