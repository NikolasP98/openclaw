/**
 * Skill registry loader — discovers and validates SkillManifests.
 *
 * The loader is fully dependency-injected to avoid hard FS coupling:
 *   - readDir(dir)   lists filenames in a directory
 *   - readFile(path) returns file content as a string
 *   - env            environment variables (for `requires` validation)
 *
 * This makes the loader testable with in-memory manifests and no real FS.
 *
 * Lifecycle:
 *   1. Collect all raw manifests (via deps.readManifests or from FS)
 *   2. Validate schema — invalid entries logged + skipped
 *   3. Check env var requirements — missing vars logged + skill excluded
 *   4. Check testCoverage gate — skills below threshold excluded in prod
 *   5. Return LoadedRegistry with valid entries + diagnostics
 *
 * @module
 */

import { validateManifest } from "./manifest.js";
import type { SkillManifest } from "./manifest.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type RegistryDiagnostic = {
  level: "warn" | "error";
  id?: string;
  message: string;
};

export type LoadedSkillEntry = {
  manifest: SkillManifest;
  /** Source description for diagnostics (file path, inline id, etc.). */
  source: string;
};

export type LoadedRegistry = {
  skills: LoadedSkillEntry[];
  diagnostics: RegistryDiagnostic[];
};

export type LoaderDeps = {
  /** Return raw manifest objects to load. Source label is paired with each. */
  readManifests: () => Array<{ raw: unknown; source: string }>;
  /** Environment variables to check for `requires` validation. */
  env: Record<string, string | undefined>;
  /** Minimum test coverage required in production mode (0 = disabled). */
  minTestCoverage?: number;
};

// ── Core loader ────────────────────────────────────────────────────────────────

/**
 * Load and validate all manifests provided by deps.readManifests().
 * Returns valid entries plus a diagnostics array for warnings/errors.
 */
export function loadRegistry(deps: LoaderDeps): LoadedRegistry {
  const { readManifests, env, minTestCoverage = 0 } = deps;

  const skills: LoadedSkillEntry[] = [];
  const diagnostics: RegistryDiagnostic[] = [];

  let rawEntries: Array<{ raw: unknown; source: string }>;
  try {
    rawEntries = readManifests();
  } catch (err) {
    diagnostics.push({
      level: "error",
      message: `Failed to read manifests: ${String(err)}`,
    });
    return { skills, diagnostics };
  }

  for (const { raw, source } of rawEntries) {
    // 1. Schema validation
    const result = validateManifest(raw);
    if (!result.ok) {
      diagnostics.push({
        level: "error",
        message: `Invalid manifest at ${source}:\n${result.errors.join("\n")}`,
      });
      continue;
    }

    const { manifest } = result;

    // 2. Env var requirements
    const missingEnv = manifest.requires.filter((varName) => !env[varName]);
    if (missingEnv.length > 0) {
      diagnostics.push({
        level: "warn",
        id: manifest.id,
        message:
          `Skill "${manifest.id}" excluded — missing required env vars: ${missingEnv.join(", ")}`,
      });
      continue;
    }

    // 3. Test coverage gate
    if (minTestCoverage > 0 && (manifest.testCoverage ?? 0) < minTestCoverage) {
      diagnostics.push({
        level: "warn",
        id: manifest.id,
        message:
          `Skill "${manifest.id}" excluded — test coverage ${manifest.testCoverage ?? 0}% < required ${minTestCoverage}%`,
      });
      continue;
    }

    skills.push({ manifest, source });
  }

  return { skills, diagnostics };
}

// ── FS-based convenience loader ────────────────────────────────────────────────

/**
 * Build LoaderDeps that reads *.manifest.json files from a directory.
 * Suitable for production use; pass to loadRegistry().
 */
export function createFsLoaderDeps(params: {
  registryDir: string;
  env?: Record<string, string | undefined>;
  minTestCoverage?: number;
}): LoaderDeps {
  return {
    env: params.env ?? process.env,
    minTestCoverage: params.minTestCoverage,
    readManifests: () => {
      // Dynamic imports to keep node:fs out of the critical path for tests
      const fs = require("node:fs") as typeof import("node:fs");
      const path = require("node:path") as typeof import("node:path");

      const dir = params.registryDir;
      if (!fs.existsSync(dir)) return [];

      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".manifest.json"))
        .map((f) => {
          const filePath = path.join(dir, f);
          try {
            const raw: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
            return { raw, source: filePath };
          } catch (err) {
            return { raw: { __parseError: String(err) }, source: filePath };
          }
        });
    },
  };
}
