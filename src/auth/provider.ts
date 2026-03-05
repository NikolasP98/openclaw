/**
 * AuthProvider interface - abstraction for OAuth providers.
 * Each provider (Google, Microsoft, GitHub) implements this interface.
 */

import type { GogCredentials } from "../hooks/gog-oauth-types.js";

// ── Types ────────────────────────────────────────────────────────────

/** Parameters for building an OAuth authorization URL */
export type AuthUrlParams = {
  /** Target account email (used as login_hint) */
  email: string;
  /** Service names to request scopes for (e.g. "gmail", "drive") */
  services: string[];
  /** OAuth redirect URI */
  redirectUri: string;
  /** Cryptographic state token for CSRF protection */
  state: string;
};

/** Token response from OAuth token exchange */
export type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

/** Parameters for storing credentials after successful auth */
export type StoreCredentialsParams = {
  /** Token response from the OAuth provider */
  tokens: TokenResponse;
  /** Account email address */
  email: string;
  /** Authorized service names */
  services: string[];
  /** Session key for credential isolation */
  sessionKey: string;
  /** Agent ID for credential storage path */
  agentId: string;
};

/**
 * Stored credentials shape.
 * Currently aliases GogCredentials for backward compatibility.
 */
export type StoredCredentials = GogCredentials;

// ── Interface ────────────────────────────────────────────────────────

/**
 * OAuth provider abstraction.
 * Each provider implements URL building, code exchange, scope mapping,
 * and credential storage/loading.
 */
export type AuthProvider = {
  /** Provider identifier: "google", "microsoft", etc. */
  readonly id: string;
  /** Human-readable name for display */
  readonly displayName: string;

  /** Build the OAuth authorization URL for user redirect */
  buildAuthUrl(params: AuthUrlParams): string;

  /** Exchange authorization code for tokens */
  exchangeCode(code: string, redirectUri: string): Promise<TokenResponse>;

  /** Map service names to OAuth scopes */
  getScopesForServices(services: string[]): string[];

  /** Get all supported service names for this provider */
  getSupportedServices(): string[];

  /** Store credentials after successful auth. Returns credential file path. */
  storeCredentials(params: StoreCredentialsParams): Promise<string>;

  /** Load credentials for a session. Returns null if not found. */
  loadCredentials(
    agentId: string,
    sessionKey: string,
    email: string,
  ): Promise<StoredCredentials | null>;
};
