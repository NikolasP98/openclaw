import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { buildAuthHealthSummary } from "../agents/auth-health.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles/store.js";
import { loadConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { parseAgentSessionKey, normalizeAgentId } from "../routing/session-key.js";
import { resolveHubMetricsConfig } from "./hub-metrics-config.js";
import type { ReliabilityEvent } from "./protocol/schema/reliability.js";
import { loadCombinedSessionStoreForGateway, listSessionsFromStore } from "./session-utils.js";

const log = createSubsystemLogger("hub-metrics");

const MAX_BUFFER_SIZE = 10_000;
const MAX_BACKOFF_MS = 30 * 60 * 1000; // 30 minutes
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type SkillStatEntry = {
  skillName: string;
  agentId?: string;
  sessionKey?: string;
  status: "ok" | "auth_error" | "timeout" | "error";
  durationMs?: number;
  errorMessage?: string;
  occurredAt: number;
};

type HubMetricsPushHandle = {
  /** Push a reliability event to the buffer. */
  pushEvent: (event: ReliabilityEvent) => void;
  /** Push a skill execution stat. */
  pushSkillStat: (stat: SkillStatEntry) => void;
  /** Force an immediate flush (for shutdown). */
  flush: () => Promise<void>;
  /** Stop the push client. */
  stop: () => void;
};

// Singleton instance
let instance: HubMetricsPushHandle | null = null;

export function getHubMetricsPushClient(): HubMetricsPushHandle | null {
  return instance;
}

function buildSessionsBatch() {
  try {
    const cfg = loadConfig();
    const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
    const cutoff = Date.now() - SESSION_MAX_AGE_MS;
    const result = listSessionsFromStore({
      cfg,
      storePath,
      store,
      opts: {},
    });

    return result.sessions
      .filter((s) => (s.updatedAt ?? 0) >= cutoff)
      .map((s) => {
        const parsed = parseAgentSessionKey(s.key);
        const agentId = normalizeAgentId(parsed?.agentId ?? resolveDefaultAgentId(cfg));
        return {
          sessionKey: s.key,
          agentId,
          status: "idle" as const,
          label: s.label,
          displayName: s.displayName,
          totalTokens: s.totalTokens,
          updatedAt: s.updatedAt,
        };
      });
  } catch {
    return [];
  }
}

export function startHubMetricsPush(rawConfig: unknown): HubMetricsPushHandle | null {
  const config = resolveHubMetricsConfig(rawConfig);

  if (!config.valid || !config.enabled) {
    log.debug("hub metrics push disabled or invalid config");
    return null;
  }

  const hubUrl = config.hubUrl!;
  const apiKey = config.apiKey!;
  const serverId = config.serverId!;
  const pushIntervalMs = config.pushIntervalMs ?? 60_000;

  // Ring buffer for reliability events
  const eventBuffer: ReliabilityEvent[] = [];
  const skillStatsBuffer: SkillStatEntry[] = [];
  let currentBackoffMs = pushIntervalMs;
  let consecutiveFailures = 0;

  function pushEvent(event: ReliabilityEvent): void {
    eventBuffer.push(event);
    if (eventBuffer.length > MAX_BUFFER_SIZE) {
      eventBuffer.splice(0, eventBuffer.length - MAX_BUFFER_SIZE);
    }
  }

  function pushSkillStat(stat: SkillStatEntry): void {
    skillStatsBuffer.push(stat);
    if (skillStatsBuffer.length > MAX_BUFFER_SIZE) {
      skillStatsBuffer.splice(0, skillStatsBuffer.length - MAX_BUFFER_SIZE);
    }
  }

  async function flush(): Promise<void> {
    const events = eventBuffer.splice(0);
    const skillStats = skillStatsBuffer.splice(0);

    // Build credential health snapshot
    let credentialHealth: { snapshotJson: string; capturedAt: number } | undefined;
    try {
      const store = ensureAuthProfileStore();
      const summary = buildAuthHealthSummary({ store });
      credentialHealth = {
        snapshotJson: JSON.stringify(summary),
        capturedAt: Date.now(),
      };
    } catch {
      // Auth store unavailable — omit
    }

    // Build heartbeat
    const heartbeat = {
      uptimeMs: Math.round(process.uptime() * 1000),
      activeSessions: 0, // Placeholder — wired up when integrated into server.impl.ts
      activeAgents: 0,
      memoryRssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
      capturedAt: Date.now(),
    };

    // Build sessions snapshot
    const sessions = buildSessionsBatch();

    const batch: Record<string, unknown> = { heartbeat };

    if (events.length > 0) {
      batch.reliabilityEvents = events.map((e) => ({
        serverId,
        agentId: e.agentId,
        category: e.category,
        severity: e.severity,
        event: e.event,
        message: e.message,
        metadata: e.metadata ? JSON.stringify(e.metadata) : undefined,
        occurredAt: e.timestamp,
      }));
    }

    if (credentialHealth) {
      batch.credentialHealth = {
        serverId,
        ...credentialHealth,
      };
    }

    if (skillStats.length > 0) {
      batch.skillStats = skillStats;
    }

    if (sessions.length > 0) {
      batch.sessions = sessions;
    }

    try {
      const url = `${hubUrl}/api/metrics/push`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ batch }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      // Reset backoff on success
      consecutiveFailures = 0;
      currentBackoffMs = pushIntervalMs;
      log.debug("metrics push ok", {
        events: events.length,
        skillStats: skillStats.length,
        sessions: sessions.length,
        hasCredentialHealth: !!credentialHealth,
      });
    } catch (err) {
      // Put events back into buffer (best effort)
      eventBuffer.unshift(...events);
      if (eventBuffer.length > MAX_BUFFER_SIZE) {
        eventBuffer.splice(0, eventBuffer.length - MAX_BUFFER_SIZE);
      }
      skillStatsBuffer.unshift(...skillStats);
      if (skillStatsBuffer.length > MAX_BUFFER_SIZE) {
        skillStatsBuffer.splice(0, skillStatsBuffer.length - MAX_BUFFER_SIZE);
      }

      consecutiveFailures++;
      currentBackoffMs = Math.min(
        pushIntervalMs * Math.pow(2, consecutiveFailures),
        MAX_BACKOFF_MS,
      );

      log.warn("metrics push failed", {
        err: String(err),
        consecutiveFailures,
        nextRetryMs: currentBackoffMs,
        bufferedEvents: eventBuffer.length,
      });
    }
  }

  // Schedule periodic flushes
  const interval = setInterval(() => {
    void flush().catch((err) => {
      log.error("flush error", { err: String(err) });
    });
  }, pushIntervalMs);

  log.info("hub metrics push started", { hubUrl, serverId, pushIntervalMs });

  const handle: HubMetricsPushHandle = {
    pushEvent,
    pushSkillStat,
    flush,
    stop() {
      clearInterval(interval);
      instance = null;
      log.info("hub metrics push stopped");
    },
  };

  instance = handle;
  return handle;
}
