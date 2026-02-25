import { emitReliabilityEvent } from "../../logging/reliability.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { isKnownOAuthProvider, refreshOAuthTokenWithLock } from "./oauth.js";
import { ensureAuthProfileStore } from "./store.js";

const log = createSubsystemLogger("auth/refresh-scheduler");

/** Default interval between refresh sweeps (15 minutes). */
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Proactively refresh tokens expiring within this window (30 minutes). */
const DEFAULT_PROACTIVE_WINDOW_MS = 30 * 60 * 1000;

/** Minimum time between refresh attempts for the same profile (5 minutes). */
const RATE_LIMIT_PER_PROFILE_MS = 5 * 60 * 1000;

type RefreshSchedulerOptions = {
  /** Interval between sweep checks in ms. Default: 15 minutes. */
  checkIntervalMs?: number;
  /** Refresh tokens expiring within this window. Default: 30 minutes. */
  proactiveWindowMs?: number;
};

type RefreshSchedulerHandle = {
  stop: () => void;
};

/** Track last refresh attempt per profileId to enforce rate limit. */
const lastRefreshAttempt = new Map<string, number>();

function shouldAttemptRefresh(profileId: string): boolean {
  const last = lastRefreshAttempt.get(profileId);
  if (!last) {
    return true;
  }
  return Date.now() - last >= RATE_LIMIT_PER_PROFILE_MS;
}

function recordRefreshAttempt(profileId: string): void {
  lastRefreshAttempt.set(profileId, Date.now());
}

async function sweepAndRefresh(proactiveWindowMs: number): Promise<void> {
  let store;
  try {
    store = ensureAuthProfileStore();
  } catch (err) {
    log.warn("failed to load auth store for refresh sweep", { err: String(err) });
    return;
  }

  const now = Date.now();
  const threshold = now + proactiveWindowMs;

  for (const [profileId, cred] of Object.entries(store.profiles)) {
    if (cred.type !== "oauth") {
      continue;
    }
    if (!cred.refresh) {
      continue;
    } // No refresh token — can't refresh
    if (cred.expires > threshold) {
      continue;
    } // Not expiring soon
    if (!shouldAttemptRefresh(profileId)) {
      continue;
    } // Rate limited

    recordRefreshAttempt(profileId);

    try {
      const result = await refreshOAuthTokenWithLock({ profileId });
      if (result) {
        log.info("proactively refreshed token", {
          profileId,
          provider: cred.provider,
          newExpires: new Date(result.newCredentials.expires).toISOString(),
        });
        emitReliabilityEvent({
          category: "auth",
          severity: "low",
          event: "credential.refresh.ok",
          message: `Proactively refreshed ${cred.provider} token for "${profileId}"`,
          metadata: { profileId, provider: cred.provider },
        });
      } else {
        if (!isKnownOAuthProvider(cred.provider)) {
          // Provider not supported by pi-ai refresh (e.g. google-workspace uses gogcli instead).
          // This is expected — skip silently.
          log.debug("proactive refresh skipped: provider not managed by pi-ai", {
            profileId,
            provider: cred.provider,
          });
        } else {
          log.warn("proactive refresh returned null", { profileId, provider: cred.provider });
          emitReliabilityEvent({
            category: "auth",
            severity: "high",
            event: "credential.refresh.failed",
            message: `Proactive refresh for ${cred.provider} "${profileId}" returned null`,
            metadata: { profileId, provider: cred.provider },
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isRevoked =
        message.includes("invalid_grant") || message.includes("Token has been revoked");
      const severity = isRevoked ? "critical" : "high";
      const event = isRevoked ? "credential.refresh_token.revoked" : "credential.refresh.failed";

      log.error("proactive refresh failed", {
        profileId,
        provider: cred.provider,
        err: message,
        isRevoked,
      });
      emitReliabilityEvent({
        category: "auth",
        severity,
        event,
        message: `Proactive refresh failed for ${cred.provider} "${profileId}": ${message}`,
        metadata: { profileId, provider: cred.provider, isRevoked },
      });
    }
  }
}

/**
 * Start the proactive OAuth token refresh scheduler.
 * Runs on a fixed interval, scanning auth store for expiring tokens
 * and refreshing them before they expire.
 */
export function startRefreshScheduler(options?: RefreshSchedulerOptions): RefreshSchedulerHandle {
  const checkIntervalMs = options?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  const proactiveWindowMs = options?.proactiveWindowMs ?? DEFAULT_PROACTIVE_WINDOW_MS;

  log.info("starting proactive refresh scheduler", {
    checkIntervalMs,
    proactiveWindowMs,
  });

  // Do an initial sweep shortly after startup (5 seconds delay)
  const initialTimeout = setTimeout(() => {
    void sweepAndRefresh(proactiveWindowMs).catch((err) => {
      log.error("initial refresh sweep failed", { err: String(err) });
    });
  }, 5_000);

  const interval = setInterval(() => {
    void sweepAndRefresh(proactiveWindowMs).catch((err) => {
      log.error("refresh sweep failed", { err: String(err) });
    });
  }, checkIntervalMs);

  return {
    stop() {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      lastRefreshAttempt.clear();
      log.info("refresh scheduler stopped");
    },
  };
}

/** Exported for testing. */
export { sweepAndRefresh as _sweepAndRefresh };
