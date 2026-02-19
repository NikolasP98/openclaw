import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store.js", () => ({
  ensureAuthProfileStore: vi.fn(),
}));

vi.mock("../auth-health.js", () => ({
  buildAuthHealthSummary: vi.fn(),
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
import type { AuthHealthSummary, AuthProfileHealth, AuthProviderHealth } from "../auth-health.js";
import { buildAuthHealthSummary } from "../auth-health.js";
import { runStartupCredentialCheck } from "./startup-check.js";
import { ensureAuthProfileStore } from "./store.js";
import type { AuthProfileStore } from "./types.js";

const mockEnsureAuthProfileStore = vi.mocked(ensureAuthProfileStore);
const mockBuildAuthHealthSummary = vi.mocked(buildAuthHealthSummary);
const mockEmitReliabilityEvent = vi.mocked(emitReliabilityEvent);

function makeProfileHealth(overrides: Partial<AuthProfileHealth>): AuthProfileHealth {
  return {
    profileId: "test-profile",
    provider: "google",
    type: "oauth",
    status: "ok",
    source: "store",
    label: "test",
    ...overrides,
  };
}

function makeProviderHealth(overrides: Partial<AuthProviderHealth>): AuthProviderHealth {
  return {
    provider: "google",
    status: "ok",
    profiles: [],
    ...overrides,
  };
}

function makeStore(
  profiles: Record<string, AuthProfileStore["profiles"][string]>,
): AuthProfileStore {
  return { version: 1, profiles };
}

function makeSummary(overrides: Partial<AuthHealthSummary>): AuthHealthSummary {
  return {
    now: Date.now(),
    warnAfterMs: 24 * 60 * 60 * 1000,
    profiles: [],
    providers: [],
    ...overrides,
  };
}

describe("startup-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an AuthHealthSummary on success", () => {
    const store = makeStore({
      "profile-1": {
        type: "oauth",
        provider: "google",
        access: "access",
        refresh: "refresh",
        expires: Date.now() + 3600_000,
      },
    });

    const summary = makeSummary({
      profiles: [makeProfileHealth({ profileId: "profile-1", status: "ok" })],
      providers: [
        makeProviderHealth({
          provider: "google",
          status: "ok",
          profiles: [makeProfileHealth({ profileId: "profile-1", status: "ok" })],
        }),
      ],
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockBuildAuthHealthSummary.mockReturnValue(summary);

    const result = runStartupCredentialCheck();

    expect(result).toBe(summary);
    expect(mockEnsureAuthProfileStore).toHaveBeenCalledTimes(1);
    expect(mockBuildAuthHealthSummary).toHaveBeenCalledWith({ store, cfg: undefined });
  });

  it("emits reliability events for expired credentials", () => {
    const store = makeStore({});
    const expiredProfile = makeProfileHealth({
      profileId: "expired-profile",
      provider: "google",
      type: "oauth",
      status: "expired",
    });

    const summary = makeSummary({
      profiles: [expiredProfile],
      providers: [
        makeProviderHealth({
          provider: "google",
          status: "expired",
          profiles: [expiredProfile],
        }),
      ],
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockBuildAuthHealthSummary.mockReturnValue(summary);

    runStartupCredentialCheck();

    expect(mockEmitReliabilityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "auth",
        severity: "high",
        event: "credential.expired",
        message: expect.stringContaining("expired-profile"),
      }),
    );
  });

  it("emits reliability events for missing credentials", () => {
    const store = makeStore({});
    const missingProfile = makeProfileHealth({
      profileId: "missing-profile",
      provider: "notion",
      type: "oauth",
      status: "missing",
    });

    const summary = makeSummary({
      profiles: [missingProfile],
      providers: [
        makeProviderHealth({
          provider: "notion",
          status: "missing",
          profiles: [missingProfile],
        }),
      ],
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockBuildAuthHealthSummary.mockReturnValue(summary);

    runStartupCredentialCheck();

    expect(mockEmitReliabilityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "auth",
        severity: "high",
        event: "credential.missing",
        message: expect.stringContaining("missing-profile"),
      }),
    );
  });

  it("emits reliability events for expiring credentials", () => {
    const store = makeStore({});
    const expiringProfile = makeProfileHealth({
      profileId: "expiring-profile",
      provider: "google",
      type: "oauth",
      status: "expiring",
      remainingMs: 3600_000,
    });

    const summary = makeSummary({
      profiles: [expiringProfile],
      providers: [
        makeProviderHealth({
          provider: "google",
          status: "expiring",
          profiles: [expiringProfile],
        }),
      ],
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockBuildAuthHealthSummary.mockReturnValue(summary);

    runStartupCredentialCheck();

    expect(mockEmitReliabilityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "auth",
        severity: "medium",
        event: "credential.expiring",
        metadata: expect.objectContaining({
          profileId: "expiring-profile",
          remainingMs: 3600_000,
        }),
      }),
    );
  });

  it("does not emit events for ok/static profiles", () => {
    const store = makeStore({});
    const okProfile = makeProfileHealth({ profileId: "ok-profile", status: "ok" });
    const staticProfile = makeProfileHealth({
      profileId: "static-profile",
      type: "api_key",
      status: "static",
    });

    const summary = makeSummary({
      profiles: [okProfile, staticProfile],
      providers: [
        makeProviderHealth({
          provider: "google",
          status: "ok",
          profiles: [okProfile, staticProfile],
        }),
      ],
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockBuildAuthHealthSummary.mockReturnValue(summary);

    runStartupCredentialCheck();

    expect(mockEmitReliabilityEvent).not.toHaveBeenCalled();
  });

  it("handles auth store load failure gracefully and returns null", () => {
    mockEnsureAuthProfileStore.mockImplementation(() => {
      throw new Error("store corrupted");
    });

    const result = runStartupCredentialCheck();

    expect(result).toBeNull();
    expect(mockEmitReliabilityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "auth",
        severity: "critical",
        event: "credential.check_failed",
        message: expect.stringContaining("store corrupted"),
      }),
    );
  });

  it("handles buildAuthHealthSummary failure gracefully", () => {
    const store = makeStore({});
    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockBuildAuthHealthSummary.mockImplementation(() => {
      throw new Error("summary build failed");
    });

    const result = runStartupCredentialCheck();

    expect(result).toBeNull();
    expect(mockEmitReliabilityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "auth",
        severity: "critical",
        event: "credential.check_failed",
      }),
    );
  });

  it("passes cfg parameter through to buildAuthHealthSummary", () => {
    const store = makeStore({});
    const summary = makeSummary({});
    const fakeCfg = { name: "test-server" } as Parameters<typeof buildAuthHealthSummary>[0]["cfg"];

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockBuildAuthHealthSummary.mockReturnValue(summary);

    runStartupCredentialCheck({ cfg: fakeCfg });

    expect(mockBuildAuthHealthSummary).toHaveBeenCalledWith({ store, cfg: fakeCfg });
  });
});
