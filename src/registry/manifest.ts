/**
 * SkillManifest — lightweight JSON-serializable descriptor for a registered
 * agent tool capability.
 *
 * Skills register by placing a manifest (JSON or TypeScript object) in the
 * registry directory. The loader validates each manifest at startup and
 * excludes entries that fail validation or are missing required env vars.
 *
 * Design goals:
 *   - Zero runtime dependencies beyond Zod (already in the project)
 *   - No FS coupling — consumers provide manifests as plain objects
 *   - Type-safe Zod schema with descriptive error messages
 *
 * @module
 */

import { z } from "zod";

// ── Schema ─────────────────────────────────────────────────────────────────────

export const SkillManifestSchema = z.object({
  /** Unique machine-readable identifier (e.g. "knowledge-graph"). */
  id: z.string().min(1, "id is required"),

  /** Human-readable display name. */
  name: z.string().min(1, "name is required"),

  /** One-sentence description for tool catalogs and help text. */
  description: z.string().min(1, "description is required"),

  /** Semver string (e.g. "1.0.0"). */
  version: z.string().regex(/^\d+\.\d+\.\d+/, "version must be semver (major.minor.patch)"),

  /** Tool names this skill exposes to the agent. */
  tools: z.array(z.string()).default([]),

  /** Environment variable names that must be set for this skill to activate. */
  requires: z.array(z.string()).default([]),

  /**
   * Relative path (from registry root) to the handler module.
   * E.g. "../../memory/knowledge-graph.js"
   */
  handler: z.string().min(1, "handler path is required"),

  /**
   * Optional test coverage gate (0–100). Skills below the threshold are
   * excluded in production mode. Useful for staging experimental skills.
   */
  testCoverage: z.number().min(0).max(100).optional(),

  /**
   * Free-form metadata bag for extension points (tags, author, homepage, …).
   */
  meta: z.record(z.string(), z.unknown()).optional(),
});

// ── Exported types ─────────────────────────────────────────────────────────────

export type SkillManifest = z.infer<typeof SkillManifestSchema>;

// ── Validation helper ──────────────────────────────────────────────────────────

export type ManifestValidationResult =
  | { ok: true; manifest: SkillManifest }
  | { ok: false; errors: string[] };

/**
 * Parse and validate a raw object as a SkillManifest.
 * Returns a discriminated union — callers decide how to handle failures.
 */
export function validateManifest(raw: unknown): ManifestValidationResult {
  const result = SkillManifestSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, manifest: result.data };
  }
  const errors = result.error.issues.map(
    (e) => `  ${e.path.join(".") || "(root)"}: ${e.message}`,
  );
  return { ok: false, errors };
}
