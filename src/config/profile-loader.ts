/**
 * Config profile loader — load and merge named profiles into config.
 *
 * Profiles are JSON files in the profiles/ directory that provide
 * preset configuration values. They are deep-merged under the user's
 * config (user config wins on conflict).
 *
 * @module
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Types ────────────────────────────────────────────────────────────────────

export type ProfileManifest = {
  name: string;
  description?: string;
  config: Record<string, unknown>;
};

// ── Deep Merge ───────────────────────────────────────────────────────────────

function isPlainObj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep merge two objects. `override` values take precedence.
 * Arrays are replaced, not concatenated.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = result[key];

    if (isPlainObj(baseValue) && isPlainObj(overrideValue)) {
      result[key] = deepMerge(baseValue, overrideValue);
    } else {
      result[key] = overrideValue;
    }
  }

  return result;
}

// ── Profile Loading ──────────────────────────────────────────────────────────

const PROFILES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../profiles");

/**
 * Load a named profile from the profiles/ directory.
 *
 * Returns the parsed profile config, or null if not found.
 */
export async function loadProfile(
  name: string,
  profilesDir: string = PROFILES_DIR,
): Promise<Record<string, unknown> | null> {
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "");
  const filePath = path.join(profilesDir, `${safeName}.json`);

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    // Strip metadata fields
    const { $schema: _, _description: __, ...config } = parsed;
    return config;
  } catch {
    return null;
  }
}

/**
 * Apply a named profile as a base layer under user config.
 *
 * Profile values are the base; user config overrides on conflict.
 * This means: deepMerge(profile, userConfig).
 */
export async function applyProfile(
  profileName: string,
  userConfig: Record<string, unknown>,
  profilesDir?: string,
): Promise<Record<string, unknown>> {
  const profile = await loadProfile(profileName, profilesDir);
  if (!profile) {
    return userConfig;
  }
  return deepMerge(profile, userConfig);
}

/**
 * List available profile names in the profiles/ directory.
 */
export async function listProfiles(profilesDir: string = PROFILES_DIR): Promise<string[]> {
  try {
    const entries = await fs.readdir(profilesDir);
    return entries
      .filter((e) => e.endsWith(".json"))
      .map((e) => e.replace(/\.json$/, ""))
      .toSorted();
  } catch {
    return [];
  }
}
