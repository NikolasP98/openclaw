import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../agents/auth-profiles/store.js", () => ({
  ensureAuthProfileStore: vi.fn(),
}));

vi.mock("../agents/auth-health.js", () => ({
  buildAuthHealthSummary: vi.fn(),
}));

vi.mock("./hub-metrics-config.js", () => ({
  resolveHubMetricsConfig: vi.fn(),
}));

vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { buildAuthHealthSummary } from "../agents/auth-health.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles/store.js";
import { resolveHubMetricsConfig } from "./hub-metrics-config.js";
import { startHubMetricsPush, getHubMetricsPushClient } from "./hub-metrics-push.js";
import type { ReliabilityEvent } from "./protocol/schema/reliability.js";

const mockEnsureAuthProfileStore = vi.mocked(ensureAuthProfileStore);
const mockBuildAuthHealthSummary = vi.mocked(buildAuthHealthSummary);
const mockResolveHubMetricsConfig = vi.mocked(resolveHubMetricsConfig);

function makeEvent(overrides?: Partial<ReliabilityEvent>): ReliabilityEvent {
  return {
    category: "auth",
    severity: "low",
    event: "credential.refresh.ok",
    message: "Test event",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("hub-metrics-push", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock global fetch
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
    });
    vi.stubGlobal("fetch", fetchSpy);

    // Default valid config
    mockResolveHubMetricsConfig.mockReturnValue({
      valid: true,
      enabled: true,
      hubUrl: "https://hub.test.com",
      apiKey: "test-api-key",
      serverId: "server-1",
      pushIntervalMs: 60_000,
    });

    // Default auth store (for credential health snapshot)
    mockEnsureAuthProfileStore.mockReturnValue({ version: 1, profiles: {} });
    mockBuildAuthHealthSummary.mockReturnValue({
      now: Date.now(),
      warnAfterMs: 86400_000,
      profiles: [],
      providers: [],
    });
  });

  afterEach(() => {
    // Clean up singleton + timers
    const client = getHubMetricsPushClient();
    if (client) {
      client.stop();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("returns null when config is not valid", () => {
    mockResolveHubMetricsConfig.mockReturnValue({
      valid: false,
      enabled: false,
    });

    const handle = startHubMetricsPush({});
    expect(handle).toBeNull();
  });

  it("returns null when config is valid but not enabled", () => {
    mockResolveHubMetricsConfig.mockReturnValue({
      valid: false,
      enabled: false,
      hubUrl: "https://hub.test.com",
      apiKey: "key",
      serverId: "s1",
    });

    const handle = startHubMetricsPush({});
    expect(handle).toBeNull();
  });

  it("returns a handle with pushEvent, pushSkillStat, flush, stop", () => {
    const handle = startHubMetricsPush({});
    expect(handle).not.toBeNull();
    expect(typeof handle!.pushEvent).toBe("function");
    expect(typeof handle!.pushSkillStat).toBe("function");
    expect(typeof handle!.flush).toBe("function");
    expect(typeof handle!.stop).toBe("function");
    handle!.stop();
  });

  describe("event buffer accumulation", () => {
    it("accumulates events in the buffer", async () => {
      const handle = startHubMetricsPush({})!;

      handle.pushEvent(makeEvent({ message: "event-1" }));
      handle.pushEvent(makeEvent({ message: "event-2" }));
      handle.pushEvent(makeEvent({ message: "event-3" }));

      await handle.flush();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.batch.reliabilityEvents).toHaveLength(3);
      expect(body.batch.reliabilityEvents[0].message).toBe("event-1");
      expect(body.batch.reliabilityEvents[2].message).toBe("event-3");

      handle.stop();
    });

    it("drains the buffer on flush", async () => {
      const handle = startHubMetricsPush({})!;

      handle.pushEvent(makeEvent({ message: "event-1" }));
      await handle.flush();

      // Second flush should have no events
      fetchSpy.mockClear();
      await handle.flush();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.batch.reliabilityEvents).toBeUndefined();

      handle.stop();
    });
  });

  describe("buffer overflow", () => {
    it("drops oldest events when buffer exceeds MAX_BUFFER_SIZE", async () => {
      const handle = startHubMetricsPush({})!;

      // Push 10001 events (MAX_BUFFER_SIZE is 10_000)
      for (let i = 0; i < 10_001; i++) {
        handle.pushEvent(makeEvent({ message: `event-${i}` }));
      }

      // Flush and check that the oldest event was dropped
      await handle.flush();
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.batch.reliabilityEvents).toHaveLength(10_000);
      // The first event (event-0) should be dropped; event-1 should be first
      expect(body.batch.reliabilityEvents[0].message).toBe("event-1");

      handle.stop();
    });
  });

  describe("successful flush", () => {
    it("posts to the correct URL with authorization header", async () => {
      const handle = startHubMetricsPush({})!;

      handle.pushEvent(makeEvent());
      await handle.flush();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://hub.test.com/api/metrics/push");
      expect(opts.method).toBe("POST");
      expect(opts.headers.Authorization).toBe("Bearer test-api-key");
      expect(opts.headers["Content-Type"]).toBe("application/json");

      handle.stop();
    });

    it("includes heartbeat in every flush", async () => {
      const handle = startHubMetricsPush({})!;

      await handle.flush();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.batch.heartbeat).toBeDefined();
      expect(typeof body.batch.heartbeat.uptimeMs).toBe("number");
      expect(typeof body.batch.heartbeat.memoryRssMb).toBe("number");
      expect(typeof body.batch.heartbeat.capturedAt).toBe("number");

      handle.stop();
    });

    it("includes credential health snapshot when auth store is available", async () => {
      mockBuildAuthHealthSummary.mockReturnValue({
        now: Date.now(),
        warnAfterMs: 86400_000,
        profiles: [],
        providers: [],
      });

      const handle = startHubMetricsPush({})!;
      await handle.flush();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.batch.credentialHealth).toBeDefined();
      expect(body.batch.credentialHealth.serverId).toBe("server-1");
      expect(typeof body.batch.credentialHealth.snapshotJson).toBe("string");

      handle.stop();
    });

    it("omits credential health when auth store throws", async () => {
      mockEnsureAuthProfileStore.mockImplementation(() => {
        throw new Error("store unavailable");
      });

      const handle = startHubMetricsPush({})!;
      await handle.flush();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.batch.credentialHealth).toBeUndefined();

      handle.stop();
    });

    it("includes skill stats when present", async () => {
      const handle = startHubMetricsPush({})!;

      handle.pushSkillStat({
        skillName: "notion",
        status: "ok",
        durationMs: 150,
        occurredAt: Date.now(),
      });

      await handle.flush();

      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.batch.skillStats).toHaveLength(1);
      expect(body.batch.skillStats[0].skillName).toBe("notion");

      handle.stop();
    });
  });

  describe("backoff on failure", () => {
    it("puts events back into buffer on fetch failure", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("network error"));

      const handle = startHubMetricsPush({})!;

      handle.pushEvent(makeEvent({ message: "retry-me" }));
      await handle.flush();

      // Events should be back in the buffer. Flush again successfully to verify.
      fetchSpy.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") });
      await handle.flush();

      const body = JSON.parse(fetchSpy.mock.calls[1][1].body);
      expect(body.batch.reliabilityEvents).toBeDefined();
      expect(
        body.batch.reliabilityEvents.some((e: { message: string }) => e.message === "retry-me"),
      ).toBe(true);

      handle.stop();
    });

    it("puts events back into buffer on HTTP error response", async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const handle = startHubMetricsPush({})!;

      handle.pushEvent(makeEvent({ message: "http-error-retry" }));
      await handle.flush();

      // Events should be back. Try again successfully.
      fetchSpy.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") });
      await handle.flush();

      const body = JSON.parse(fetchSpy.mock.calls[1][1].body);
      expect(body.batch.reliabilityEvents).toBeDefined();

      handle.stop();
    });

    it("does not exceed MAX_BUFFER_SIZE when putting events back", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("network error"));

      const handle = startHubMetricsPush({})!;

      // Fill buffer nearly to max
      for (let i = 0; i < 9999; i++) {
        handle.pushEvent(makeEvent({ message: `pre-${i}` }));
      }

      // Push one more, then fail flush
      handle.pushEvent(makeEvent({ message: "last-event" }));
      await handle.flush();

      // Add more events after failure (buffer was restored)
      handle.pushEvent(makeEvent({ message: "post-failure" }));

      // Flush successfully
      fetchSpy.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") });
      await handle.flush();

      const body = JSON.parse(fetchSpy.mock.calls[1][1].body);
      // Should not exceed 10_000
      expect(body.batch.reliabilityEvents.length).toBeLessThanOrEqual(10_000);

      handle.stop();
    });
  });

  describe("singleton management", () => {
    it("sets the singleton on start and clears on stop", () => {
      const handle = startHubMetricsPush({})!;
      expect(getHubMetricsPushClient()).toBe(handle);

      handle.stop();
      expect(getHubMetricsPushClient()).toBeNull();
    });
  });

  describe("periodic flush scheduling", () => {
    it("flushes on the configured interval", async () => {
      mockResolveHubMetricsConfig.mockReturnValue({
        valid: true,
        enabled: true,
        hubUrl: "https://hub.test.com",
        apiKey: "test-api-key",
        serverId: "server-1",
        pushIntervalMs: 10_000,
      });

      const handle = startHubMetricsPush({})!;

      handle.pushEvent(makeEvent());

      // Advance past the interval (use advanceTimersByTimeAsync to handle promises)
      await vi.advanceTimersByTimeAsync(10_001);

      expect(fetchSpy).toHaveBeenCalled();

      handle.stop();
    });
  });
});
