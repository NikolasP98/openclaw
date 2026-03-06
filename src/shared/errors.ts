/**
 * Base error hierarchy for openclaw.
 *
 * All domain-specific errors should extend `AppError` so callers can
 * discriminate with `instanceof` checks instead of parsing `.message`.
 *
 * Existing typed errors (`FailoverError`, `ToolInputError`, etc.) predate
 * this hierarchy and can be migrated incrementally.
 *
 * @module
 */

/**
 * Base error class for all openclaw application errors.
 *
 * Carries an optional `code` string for programmatic discrimination
 * (e.g. "ENOENT", "QUOTA_EXCEEDED") and supports the standard `cause`
 * chain via `Error(message, { cause })`.
 */
export class AppError extends Error {
  readonly code?: string;

  constructor(message: string, opts?: { code?: string; cause?: unknown }) {
    super(message, opts?.cause != null ? { cause: opts.cause } : undefined);
    this.name = "AppError";
    this.code = opts?.code;
  }
}

/** Configuration loading, parsing, or validation errors. */
export class ConfigError extends AppError {
  constructor(message: string, opts?: { code?: string; cause?: unknown }) {
    super(message, opts);
    this.name = "ConfigError";
  }
}

/** Session lifecycle errors (expired, locked, corrupted). */
export class SessionError extends AppError {
  constructor(message: string, opts?: { code?: string; cause?: unknown }) {
    super(message, opts);
    this.name = "SessionError";
  }
}

/** Authentication and authorization failures. */
export class AuthError extends AppError {
  readonly status?: number;

  constructor(message: string, opts?: { code?: string; cause?: unknown; status?: number }) {
    super(message, opts);
    this.name = "AuthError";
    this.status = opts?.status;
  }
}

/** File system and storage errors. */
export class StorageError extends AppError {
  constructor(message: string, opts?: { code?: string; cause?: unknown }) {
    super(message, opts);
    this.name = "StorageError";
  }
}

/** Gateway server errors (lock, port, request limits). */
export class GatewayError extends AppError {
  readonly status?: number;

  constructor(message: string, opts?: { code?: string; cause?: unknown; status?: number }) {
    super(message, opts);
    this.name = "GatewayError";
    this.status = opts?.status;
  }
}
