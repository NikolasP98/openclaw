import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before importing the module under test.
vi.mock("./store.js", () => ({
  ensureAuthProfileStore: vi.fn(),
}));

vi.mock("./oauth.js", () => ({
  refreshOAuthTokenWithLock: vi.fn(),
}));

vi.mock("../../logging/reliability.js", () => ({
  emitReliabilityEvent: vi.fn(),
}));

vi.mock("../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { emitReliabilityEvent } from "../../logging/reliability.js";
import { refreshOAuthTokenWithLock } from "./oauth.js";
import { _sweepAndRefresh, startRefreshScheduler } from "./refresh-scheduler.js";
import { ensureAuthProfileStore } from "./store.js";
import type { AuthProfileStore, OAuthCredential } from "./types.js";

const mockEnsureAuthProfileStore = vi.mocked(ensureAuthProfileStore);
const mockRefreshOAuthTokenWithLock = vi.mocked(refreshOAuthTokenWithLock);
const mockEmitReliabilityEvent = vi.mocked(emitReliabilityEvent);

function makeOAuthProfile(overrides?: Partial<OAuthCredential>): OAuthCredential {
  return {
    type: "oauth",
    provider: "google",
    access: "access-token",
    refresh: "refresh-token",
    expires: Date.now() + 10 * 60 * 1000, // 10 minutes from now
    ...overrides,
  };
}

function makeStore(
  profiles: Record<string, AuthProfileStore["profiles"][string]>,
): AuthProfileStore {
  return { version: 1, profiles };
}

describe("refresh-scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("sweepAndRefresh", () => {
    it("only refreshes tokens expiring within the proactive window", async () => {
      const proactiveWindowMs = 30 * 60 * 1000; // 30 minutes
      const now = Date.now();

      const store = makeStore({
        "expiring-soon": makeOAuthProfile({
          expires: now + 20 * 60 * 1000, // 20 min from now — within 30 min window
        }),
        "not-expiring": makeOAuthProfile({
          expires: now + 60 * 60 * 1000, // 60 min from now — outside 30 min window
        }),
      });

      mockEnsureAuthProfileStore.mockReturnValue(store);
      mockRefreshOAuthTokenWithLock.mockResolvedValue({
        apiKey: "new-key",
        newCredentials: { access: "new-access", refresh: "new-refresh", expires: now + 3600_000 },
      });

      await _sweepAndRefresh(proactiveWindowMs);

      // Only the "expiring-soon" profile should have been refreshed.
      expect(mockRefreshOAuthTokenWithLock).toHaveBeenCalledTimes(1);
      expect(mockRefreshOAuthTokenWithLock).toHaveBeenCalledWith({ profileId: "expiring-soon" });
    });

    it("rate-limits: skips a profile if refreshed less than 5 minutes ago", async () => {
      const proactiveWindowMs = 30 * 60 * 1000;
      const now = Date.now();

      const store = makeStore({
        "profile-a": makeOAuthProfile({
          expires: now + 10 * 60 * 1000,
        }),
      });

      mockEnsureAuthProfileStore.mockReturnValue(store);
      mockRefreshOAuthTokenWithLock.mockResolvedValue({
        apiKey: "new-key",
        newCredentials: { access: "new-access", refresh: "new-refresh", expires: now + 3600_000 },
      });

      // First sweep: should refresh.
      await _sweepAndRefresh(proactiveWindowMs);
      expect(mockRefreshOAuthTokenWithLock).toHaveBeenCalledTimes(1);

      // Second sweep immediately: should be rate-limited.
      await _sweepAndRefresh(proactiveWindowMs);
      expect(mockRefreshOAuthTokenWithLock).toHaveBeenCalledTimes(1);

      // Advance time past the 5-minute rate limit.
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Third sweep: should refresh again.
      await _sweepAndRefresh(proactiveWindowMs);
      expect(mockRefreshOAuthTokenWithLock).toHaveBeenCalledTimes(2);
    });

    it("skips non-OAuth profiles", async () => {
      const proactiveWindowMs = 30 * 60 * 1000;

      const store = makeStore({
        "api-key-profile": {
          type: "api_key",
          provider: "openai",
          key: "sk-123",
        },
        "token-profile": {
          type: "token",
          provider: "github",
          token: "ghp-456",
        },
      });

      mockEnsureAuthProfileStore.mockReturnValue(store);

      await _sweepAndRefresh(proactiveWindowMs);

      expect(mockRefreshOAuthTokenWithLock).not.toHaveBeenCalled();
    });

    it("skips OAuth profiles without refresh tokens", async () => {
      const proactiveWindowMs = 30 * 60 * 1000;
      const now = Date.now();

      const store = makeStore({
        "no-refresh": {
          type: "oauth",
          provider: "google",
          access: "access-token",
          refresh: "", // empty refresh
          expires: now + 10 * 60 * 1000,
        } as OAuthCredential,
      });

      mockEnsureAuthProfileStore.mockReturnValue(store);

      await _sweepAndRefresh(proactiveWindowMs);

      expect(mockRefreshOAuthTokenWithLock).not.toHaveBeenCalled();
    });

    it("emits reliability event on successful refresh", async () => {
      const proactiveWindowMs = 30 * 60 * 1000;
      const now = Date.now();

      const store = makeStore({
        "profile-ok": makeOAuthProfile({
          expires: now + 10 * 60 * 1000,
        }),
      });

      mockEnsureAuthProfileStore.mockReturnValue(store);
      mockRefreshOAuthTokenWithLock.mockResolvedValue({
        apiKey: "new-key",
        newCredentials: { access: "new-access", refresh: "new-refresh", expires: now + 3600_000 },
      });

      await _sweepAndRefresh(proactiveWindowMs);

      expect(mockEmitReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "auth",
          severity: "low",
          event: "credential.refresh.ok",
        }),
      );
    });

    it("emits high severity on null refresh result", async () => {
      const proactiveWindowMs = 30 * 60 * 1000;
      const now = Date.now();

      const store = makeStore({
        "profile-null": makeOAuthProfile({
          expires: now + 10 * 60 * 1000,
        }),
      });

      mockEnsureAuthProfileStore.mockReturnValue(store);
      mockRefreshOAuthTokenWithLock.mockResolvedValue(null);

      await _sweepAndRefresh(proactiveWindowMs);

      expect(mockEmitReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "auth",
          severity: "high",
          event: "credential.refresh.failed",
        }),
      );
    });

    it("emits critical severity when refresh token is revoked", async () => {
      const proactiveWindowMs = 30 * 60 * 1000;
      const now = Date.now();

      const store = makeStore({
        "revoked-profile": makeOAuthProfile({
          expires: now + 10 * 60 * 1000,
        }),
      });

      mockEnsureAuthProfileStore.mockReturnValue(store);
      mockRefreshOAuthTokenWithLock.mockRejectedValue(new Error("invalid_grant"));

      await _sweepAndRefresh(proactiveWindowMs);

      expect(mockEmitReliabilityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          category: "auth",
          severity: "critical",
          event: "credential.refresh_token.revoked",
        }),
      );
    });

    it("handles auth store load failure gracefully", async () => {
      mockEnsureAuthProfileStore.mockImplementation(() => {
        throw new Error("store not found");
      });

      await _sweepAndRefresh(30 * 60 * 1000);

      expect(mockRefreshOAuthTokenWithLock).not.toHaveBeenCalled();
      expect(mockEmitReliabilityEvent).not.toHaveBeenCalled();
    });
  });

  describe("startRefreshScheduler", () => {
    it("returns a handle with a stop function", () => {
      mockEnsureAuthProfileStore.mockReturnValue(makeStore({}));
      const handle = startRefreshScheduler({ checkIntervalMs: 60_000 });
      expect(handle).toBeDefined();
      expect(typeof handle.stop).toBe("function");
      handle.stop();
    });

    it("runs initial sweep after 5 seconds", async () => {
      mockEnsureAuthProfileStore.mockReturnValue(makeStore({}));
      const handle = startRefreshScheduler({ checkIntervalMs: 60_000 });

      // Advance only the 5-second initial timeout (not all timers which loops forever)
      await vi.advanceTimersByTimeAsync(5_001);

      expect(mockEnsureAuthProfileStore).toHaveBeenCalled();
      handle.stop();
    });
  });
});
