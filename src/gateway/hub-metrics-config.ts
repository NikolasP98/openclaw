/**
 * Configuration type for the hub metrics push client.
 * Added to minion.json under `hubMetrics`.
 */
export type HubMetricsConfig = {
  /** Enable/disable metrics push to hub. Default: false. */
  enabled?: boolean;
  /** Hub URL (e.g. "https://minion-hub.vercel.app"). */
  hubUrl?: string;
  /** Server token for authentication (from hub server registration). */
  apiKey?: string;
  /** Hub-assigned server ID. */
  serverId?: string;
  /** Push interval in milliseconds. Default: 60000 (1 minute). */
  pushIntervalMs?: number;
};

export function resolveHubMetricsConfig(raw: unknown): HubMetricsConfig & { valid: boolean } {
  if (!raw || typeof raw !== "object") {
    return { enabled: false, valid: false };
  }
  const cfg = raw as Record<string, unknown>;
  const enabled = cfg.enabled === true;
  const hubUrl = typeof cfg.hubUrl === "string" ? cfg.hubUrl.trim() : undefined;
  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey.trim() : undefined;
  const serverId = typeof cfg.serverId === "string" ? cfg.serverId.trim() : undefined;
  const pushIntervalMs =
    typeof cfg.pushIntervalMs === "number" && cfg.pushIntervalMs > 0 ? cfg.pushIntervalMs : 60_000;

  const valid = enabled && !!hubUrl && !!apiKey && !!serverId;

  return { enabled, hubUrl, apiKey, serverId, pushIntervalMs, valid };
}
