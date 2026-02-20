import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth-profiles.js", () => ({
  ensureAuthProfileStore: vi.fn(),
}));

vi.mock("./config.js", () => ({
  resolveSkillConfig: vi.fn(),
}));

vi.mock("./frontmatter.js", () => ({
  resolveSkillKey: vi.fn((_skill: unknown, entry?: { metadata?: { skillKey?: string } }) => {
    return entry?.metadata?.skillKey ?? "default-skill";
  }),
}));

vi.mock("../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { ensureAuthProfileStore } from "../auth-profiles.js";
import type {
  AuthProfileStore,
  OAuthCredential,
  ApiKeyCredential,
} from "../auth-profiles/types.js";
import { resolveSkillConfig } from "./config.js";
import { resolveSkillEnvMap } from "./env-overrides.js";
import type { SkillEntry } from "./types.js";

const mockEnsureAuthProfileStore = vi.mocked(ensureAuthProfileStore);
const mockResolveSkillConfig = vi.mocked(resolveSkillConfig);

function makeStore(
  profiles: Record<string, AuthProfileStore["profiles"][string]>,
): AuthProfileStore {
  return { version: 1, profiles };
}

function makeOAuthProfile(
  provider: string,
  accessToken: string,
  overrides?: Partial<OAuthCredential>,
): OAuthCredential {
  return {
    type: "oauth",
    provider,
    access: accessToken,
    refresh: "refresh-token",
    expires: Date.now() + 3600_000,
    ...overrides,
  };
}

function makeSkillEntry(skillKey: string, primaryEnv: string): SkillEntry {
  return {
    skill: {
      name: skillKey,
      description: "",
      filePath: "",
      baseDir: "",
      source: "test",
      disableModelInvocation: false,
    },
    frontmatter: {},
    metadata: { skillKey, primaryEnv },
  };
}

describe("env-overrides session-scoped credential selection", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    // Save any env vars we might touch
    savedEnv.NOTION_API_KEY = process.env.NOTION_API_KEY;
    delete process.env.NOTION_API_KEY;
  });

  afterEach(() => {
    // Restore
    if (savedEnv.NOTION_API_KEY === undefined) {
      delete process.env.NOTION_API_KEY;
    } else {
      process.env.NOTION_API_KEY = savedEnv.NOTION_API_KEY;
    }
  });

  it("uses the specified profile when sessionSkillAuth is provided", () => {
    const store = makeStore({
      "user-alice": makeOAuthProfile("notion", "alice-token"),
      "user-bob": makeOAuthProfile("notion", "bob-token"),
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockResolveSkillConfig.mockReturnValue({ enabled: true });

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
      sessionSkillAuth: { notion: "user-bob" },
    });

    expect(result.NOTION_API_KEY).toBe("bob-token");
  });

  it("falls back to first-match when the specified profile does not exist", () => {
    const store = makeStore({
      "user-alice": makeOAuthProfile("notion", "alice-token"),
      "user-bob": makeOAuthProfile("notion", "bob-token"),
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockResolveSkillConfig.mockReturnValue({ enabled: true });

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
      sessionSkillAuth: { notion: "user-nonexistent" },
    });

    // Should fall through to first-match behavior — "user-alice" is first
    expect(result.NOTION_API_KEY).toBe("alice-token");
  });

  it("uses first-match behavior when sessionSkillAuth is not provided (backward compat)", () => {
    const store = makeStore({
      "user-alice": makeOAuthProfile("notion", "alice-token"),
      "user-bob": makeOAuthProfile("notion", "bob-token"),
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockResolveSkillConfig.mockReturnValue({ enabled: true });

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
    });

    // Without sessionSkillAuth, iterates all profiles and picks first match
    expect(result.NOTION_API_KEY).toBe("alice-token");
  });

  it("uses first-match when sessionSkillAuth is empty object", () => {
    const store = makeStore({
      "user-alice": makeOAuthProfile("notion", "alice-token"),
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockResolveSkillConfig.mockReturnValue({ enabled: true });

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
      sessionSkillAuth: {},
    });

    expect(result.NOTION_API_KEY).toBe("alice-token");
  });

  it("prefers skillConfig.apiKey over auth profiles", () => {
    const store = makeStore({
      "user-alice": makeOAuthProfile("notion", "alice-token"),
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockResolveSkillConfig.mockReturnValue({ enabled: true, apiKey: "static-api-key" });

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
      sessionSkillAuth: { notion: "user-alice" },
    });

    // apiKey takes precedence over auth profiles
    expect(result.NOTION_API_KEY).toBe("static-api-key");
  });

  it("does not set env for a skill when resolveSkillConfig returns undefined", () => {
    mockEnsureAuthProfileStore.mockReturnValue(makeStore({}));
    mockResolveSkillConfig.mockReturnValue(undefined);

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
      sessionSkillAuth: { notion: "some-profile" },
    });

    expect(result).toEqual({});
  });

  it("does not override when process.env already has the key set", () => {
    process.env.NOTION_API_KEY = "already-set";

    const store = makeStore({
      "user-alice": makeOAuthProfile("notion", "alice-token"),
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockResolveSkillConfig.mockReturnValue({ enabled: true });

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
      sessionSkillAuth: { notion: "user-alice" },
    });

    // Should not be in the map because process.env already has it
    expect(result.NOTION_API_KEY).toBeUndefined();
  });

  it("handles auth store load failure gracefully (returns empty env for that skill)", () => {
    mockEnsureAuthProfileStore.mockImplementation(() => {
      throw new Error("store unavailable");
    });
    mockResolveSkillConfig.mockReturnValue({ enabled: true });

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
      sessionSkillAuth: { notion: "some-profile" },
    });

    // loadAuthStoreSafe catches the error and returns undefined
    expect(result.NOTION_API_KEY).toBeUndefined();
  });

  it("resolves api_key credential type correctly via first-match", () => {
    const store = makeStore({
      "openai-key": {
        type: "api_key",
        provider: "openai",
        key: "sk-abc123",
      } satisfies ApiKeyCredential,
    });

    mockEnsureAuthProfileStore.mockReturnValue(store);
    mockResolveSkillConfig.mockReturnValue({ enabled: true });

    const entry = makeSkillEntry("openai", "OPENAI_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
    });

    expect(result.OPENAI_API_KEY).toBe("sk-abc123");
  });

  it("applies skillConfig.env entries to the map", () => {
    mockEnsureAuthProfileStore.mockReturnValue(makeStore({}));
    mockResolveSkillConfig.mockReturnValue({
      enabled: true,
      env: { CUSTOM_VAR: "custom-value" },
    });

    const entry = makeSkillEntry("notion", "NOTION_API_KEY");

    const result = resolveSkillEnvMap({
      skills: [entry],
    });

    expect(result.CUSTOM_VAR).toBe("custom-value");
  });
});
