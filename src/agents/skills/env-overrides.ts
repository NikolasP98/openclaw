import type { OpenClawConfig } from "../../config/config.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { ensureAuthProfileStore } from "../auth-profiles.js";
import type { AuthProfileCredential, AuthProfileStore } from "../auth-profiles/types.js";
import { resolveSkillConfig } from "./config.js";
import { resolveSkillKey } from "./frontmatter.js";
import type { SkillEntry, SkillSnapshot } from "./types.js";

const log = createSubsystemLogger("skills/env");

function loadAuthStoreSafe(): AuthProfileStore | undefined {
  try {
    return ensureAuthProfileStore();
  } catch {
    return undefined;
  }
}

type EnvUpdate = { key: string; prev: string | undefined };
type SkillConfig = NonNullable<ReturnType<typeof resolveSkillConfig>>;

function extractCredentialToken(cred: AuthProfileCredential): string | undefined {
  switch (cred.type) {
    case "oauth":
      return cred.access;
    case "api_key":
      return cred.key;
    case "token":
      return cred.token;
  }
}

function applySkillConfigEnvOverrides(params: {
  updates: EnvUpdate[];
  skillConfig: SkillConfig;
  primaryEnv?: string | null;
  skillKey?: string;
  authStore?: AuthProfileStore;
}) {
  const { updates, skillConfig, primaryEnv, skillKey, authStore } = params;
  if (skillConfig.env) {
    for (const [envKey, envValue] of Object.entries(skillConfig.env)) {
      if (!envValue || process.env[envKey]) {
        continue;
      }
      updates.push({ key: envKey, prev: process.env[envKey] });
      process.env[envKey] = envValue;
    }
  }

  if (primaryEnv && skillConfig.apiKey && !process.env[primaryEnv]) {
    updates.push({ key: primaryEnv, prev: process.env[primaryEnv] });
    process.env[primaryEnv] = skillConfig.apiKey;
  }

  // Fallback: resolve primaryEnv from auth profiles (e.g. Notion OAuth → NOTION_API_KEY)
  if (primaryEnv && !process.env[primaryEnv] && skillKey && authStore) {
    for (const cred of Object.values(authStore.profiles)) {
      if (cred.provider === skillKey) {
        const token = extractCredentialToken(cred);
        if (token) {
          updates.push({ key: primaryEnv, prev: process.env[primaryEnv] });
          process.env[primaryEnv] = token;
          break;
        }
      }
    }
  }
}

function createEnvReverter(updates: EnvUpdate[]) {
  return () => {
    for (const update of updates) {
      if (update.prev === undefined) {
        delete process.env[update.key];
      } else {
        process.env[update.key] = update.prev;
      }
    }
  };
}

export function applySkillEnvOverrides(params: { skills: SkillEntry[]; config?: OpenClawConfig }) {
  const { skills, config } = params;
  const updates: EnvUpdate[] = [];
  const authStore = loadAuthStoreSafe();

  for (const entry of skills) {
    const skillKey = resolveSkillKey(entry.skill, entry);
    const skillConfig = resolveSkillConfig(config, skillKey);
    if (!skillConfig) {
      continue;
    }

    applySkillConfigEnvOverrides({
      updates,
      skillConfig,
      primaryEnv: entry.metadata?.primaryEnv,
      skillKey,
      authStore,
    });
  }

  return createEnvReverter(updates);
}

export function applySkillEnvOverridesFromSnapshot(params: {
  snapshot?: SkillSnapshot;
  config?: OpenClawConfig;
}) {
  const { snapshot, config } = params;
  if (!snapshot) {
    return () => {};
  }
  const updates: EnvUpdate[] = [];
  const authStore = loadAuthStoreSafe();

  for (const skill of snapshot.skills) {
    const skillConfig = resolveSkillConfig(config, skill.name);
    if (!skillConfig) {
      continue;
    }

    applySkillConfigEnvOverrides({
      updates,
      skillConfig,
      primaryEnv: skill.primaryEnv,
      skillKey: skill.name,
      authStore,
    });
  }

  return createEnvReverter(updates);
}

/**
 * Collects env overrides into a plain map instead of mutating process.env.
 * Used by resolveSkillEnvMap / resolveSkillEnvMapFromSnapshot.
 *
 * When `sessionSkillAuth` is provided (maps skillKey → profileId), the
 * specified profile is used instead of iterating all profiles. This prevents
 * the "wrong user credentials" bug where the first matching profile is used.
 */
function collectSkillConfigEnv(
  map: Record<string, string>,
  params: {
    skillConfig: SkillConfig;
    primaryEnv?: string | null;
    skillKey?: string;
    authStore?: AuthProfileStore;
    sessionSkillAuth?: Record<string, string>;
  },
) {
  const { skillConfig, primaryEnv, skillKey, authStore, sessionSkillAuth } = params;
  if (skillConfig.env) {
    for (const [envKey, envValue] of Object.entries(skillConfig.env)) {
      if (!envValue || process.env[envKey] || map[envKey]) {
        continue;
      }
      map[envKey] = envValue;
    }
  }

  if (primaryEnv && skillConfig.apiKey && !process.env[primaryEnv] && !map[primaryEnv]) {
    map[primaryEnv] = skillConfig.apiKey;
  }

  // Resolve primaryEnv from auth profiles (e.g. Notion OAuth → NOTION_API_KEY)
  if (primaryEnv && !process.env[primaryEnv] && !map[primaryEnv] && skillKey && authStore) {
    // Session-scoped: use the specified profileId if available
    const sessionProfileId = sessionSkillAuth?.[skillKey];
    if (sessionProfileId) {
      const cred = authStore.profiles[sessionProfileId];
      if (cred) {
        const token = extractCredentialToken(cred);
        if (token) {
          map[primaryEnv] = token;
          log.debug("skill env resolved", {
            skillKey,
            profileId: sessionProfileId,
            source: "session-override",
          });
          return;
        }
      }
      log.warn("session-scoped profileId not found or has no token", {
        skillKey,
        profileId: sessionProfileId,
      });
      // Fall through to first-match behavior
    }

    // First-match fallback: iterate all profiles matching the provider
    for (const [profileId, cred] of Object.entries(authStore.profiles)) {
      if (cred.provider === skillKey) {
        const token = extractCredentialToken(cred);
        if (token) {
          map[primaryEnv] = token;
          log.debug("skill env resolved", {
            skillKey,
            profileId,
            source: "first-match",
          });
          break;
        }
      }
    }
  }
}

/**
 * Returns a session-scoped env override map (no global process.env mutation).
 * The returned map is intended to be passed to the exec tool as `envOverrides`.
 *
 * @param sessionSkillAuth Optional map of skillKey → profileId for session-scoped
 *   credential isolation. When present, the specified profile is used instead of
 *   iterating all profiles (prevents "wrong user credentials" bug).
 */
export function resolveSkillEnvMap(params: {
  skills: SkillEntry[];
  config?: OpenClawConfig;
  sessionSkillAuth?: Record<string, string>;
}): Record<string, string> {
  const { skills, config, sessionSkillAuth } = params;
  const map: Record<string, string> = {};
  const authStore = loadAuthStoreSafe();

  for (const entry of skills) {
    const skillKey = resolveSkillKey(entry.skill, entry);
    const skillConfig = resolveSkillConfig(config, skillKey);
    if (!skillConfig) {
      continue;
    }

    collectSkillConfigEnv(map, {
      skillConfig,
      primaryEnv: entry.metadata?.primaryEnv,
      skillKey,
      authStore,
      sessionSkillAuth,
    });
  }

  return map;
}

/**
 * Snapshot variant of resolveSkillEnvMap — returns a session-scoped env override map.
 *
 * @param sessionSkillAuth Optional map of skillKey → profileId for session-scoped
 *   credential isolation.
 */
export function resolveSkillEnvMapFromSnapshot(params: {
  snapshot?: SkillSnapshot;
  config?: OpenClawConfig;
  sessionSkillAuth?: Record<string, string>;
}): Record<string, string> {
  const { snapshot, config, sessionSkillAuth } = params;
  if (!snapshot) {
    return {};
  }
  const map: Record<string, string> = {};
  const authStore = loadAuthStoreSafe();

  for (const skill of snapshot.skills) {
    const skillConfig = resolveSkillConfig(config, skill.name);
    if (!skillConfig) {
      continue;
    }

    collectSkillConfigEnv(map, {
      skillConfig,
      primaryEnv: skill.primaryEnv,
      skillKey: skill.name,
      authStore,
      sessionSkillAuth,
    });
  }

  return map;
}
