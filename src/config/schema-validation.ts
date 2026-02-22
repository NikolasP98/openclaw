/**
 * Config schema validation — validate config at startup using Zod schemas.
 *
 * Wraps the MinionSchema to provide human-friendly error messages and
 * structured validation results for startup diagnostics.
 *
 * @module
 */

import type { ZodIssue } from "zod";
import { MinionSchema } from "./zod-schema.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
};

export type ValidationError = {
  /** Dot-separated path to the invalid field (e.g. "agents.defaults.model.primary"). */
  path: string;
  /** Human-readable error message. */
  message: string;
  /** Zod issue code (e.g. "invalid_type", "unrecognized_keys"). */
  code: string;
};

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Format a Zod issue path as a dot-separated string.
 */
function formatPath(path: (string | number)[]): string {
  return path
    .map((segment) => (typeof segment === "number" ? `[${segment}]` : segment))
    .join(".")
    .replace(/\.\[/g, "[");
}

/**
 * Convert a Zod issue to a ValidationError.
 */
function toValidationError(issue: ZodIssue): ValidationError {
  return {
    path: formatPath(issue.path),
    message: issue.message,
    code: issue.code,
  };
}

/**
 * Validate a config object against the MinionSchema at startup.
 *
 * Returns a structured result with all validation errors (not just the first).
 * Safe to call with any input — never throws.
 */
export function validateConfigAtStartup(config: unknown): ValidationResult {
  const result = MinionSchema.safeParse(config);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  const errors = result.error.issues.map(toValidationError);
  return { valid: false, errors };
}

/**
 * Format validation errors as a human-readable string for logging.
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return "No errors";
  }
  return errors
    .map((e, i) => `  ${i + 1}. ${e.path || "(root)"}: ${e.message} [${e.code}]`)
    .join("\n");
}
