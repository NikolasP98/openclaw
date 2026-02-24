import type { MinionConfig } from "minion/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "minion/plugin-sdk/account-id";
import type { WatiAccountConfig } from "./types.js";

export type ResolvedWatiAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  apiUrl?: string;
  apiToken?: string;
  config: WatiAccountConfig;
};

const ENV_WATI_API_URL = "WATI_API_URL";
const ENV_WATI_API_TOKEN = "WATI_API_TOKEN";

function listConfiguredAccountIds(cfg: MinionConfig): string[] {
  const accounts = (cfg.channels as Record<string, unknown>)?.wati as
    | { accounts?: Record<string, unknown> }
    | undefined;
  if (!accounts?.accounts || typeof accounts.accounts !== "object") {
    return [];
  }
  return Object.keys(accounts.accounts).filter(Boolean);
}

export function listWatiAccountIds(cfg: MinionConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultWatiAccountId(cfg: MinionConfig): string {
  const channel = (cfg.channels as Record<string, unknown>)?.wati as
    | { defaultAccount?: string }
    | undefined;
  if (channel?.defaultAccount?.trim()) {
    return channel.defaultAccount.trim();
  }
  const ids = listWatiAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: MinionConfig,
  accountId: string,
): WatiAccountConfig | undefined {
  const watiSection = (cfg.channels as Record<string, unknown>)?.wati as
    | { accounts?: Record<string, WatiAccountConfig> }
    | undefined;
  if (!watiSection?.accounts || typeof watiSection.accounts !== "object") {
    return undefined;
  }
  return watiSection.accounts[accountId];
}

function mergeWatiAccountConfig(
  cfg: MinionConfig,
  accountId: string,
): WatiAccountConfig {
  const raw = ((cfg.channels as Record<string, unknown>)?.wati ?? {}) as Record<
    string,
    unknown
  >;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account } as WatiAccountConfig;
}

function resolveApiCredentials(
  accountId: string,
  account: WatiAccountConfig,
): { apiUrl?: string; apiToken?: string } {
  if (account.apiUrl?.trim() && account.apiToken?.trim()) {
    return { apiUrl: account.apiUrl.trim(), apiToken: account.apiToken.trim() };
  }
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const envUrl = process.env[ENV_WATI_API_URL]?.trim();
    const envToken = process.env[ENV_WATI_API_TOKEN]?.trim();
    if (envUrl && envToken) {
      return { apiUrl: envUrl, apiToken: envToken };
    }
  }
  return {
    apiUrl: account.apiUrl?.trim() || undefined,
    apiToken: account.apiToken?.trim() || undefined,
  };
}

export function resolveWatiAccount(params: {
  cfg: MinionConfig;
  accountId?: string | null;
}): ResolvedWatiAccount {
  const accountId = normalizeAccountId(params.accountId);
  const watiSection = (params.cfg.channels as Record<string, unknown>)?.wati as
    | { enabled?: boolean }
    | undefined;
  const baseEnabled = watiSection?.enabled !== false;
  const merged = mergeWatiAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const credentials = resolveApiCredentials(accountId, merged);

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    apiUrl: credentials.apiUrl,
    apiToken: credentials.apiToken,
    config: merged,
  };
}

export function listEnabledWatiAccounts(
  cfg: MinionConfig,
): ResolvedWatiAccount[] {
  return listWatiAccountIds(cfg)
    .map((accountId) => resolveWatiAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
