/**
 * Type definitions for Google OAuth non-blocking authentication flow
 */

/**
 * Configuration for the OAuth callback server
 */
export interface OAuthServerConfig {
	/** Port to bind the server to (default: 51234) */
	port?: number;
	/** Host to bind to (default: "127.0.0.1") */
	bind?: string;
	/** Callback endpoint path (default: "/oauth-callback") */
	callbackPath?: string;
	/** Timeout in minutes for pending OAuth flows (default: 5) */
	timeoutMinutes?: number;
	/** Whether the server is enabled (default: true) */
	enabled?: boolean;
}

/**
 * Pending OAuth flow state
 */
export interface PendingOAuthFlow {
	/** Cryptographic state token for CSRF protection */
	state: string;
	/** Session key for this authentication flow */
	sessionKey: string;
	/** Agent ID for credential storage */
	agentId: string;
	/** Target Google account email */
	email: string;
	/** Requested Google services (gmail, calendar, drive, etc) */
	services: string[];
	/** Timestamp when the flow was initiated */
	requestedAt: number;
	/** Timestamp when the flow expires (5 minutes) */
	expiresAt: number;
	/** OAuth authorization URL sent to user */
	authUrl: string;
}

/**
 * Stored Google credentials
 */
export interface GogCredentials {
	/** Google account email */
	email: string;
	/** OAuth access token (short-lived) */
	accessToken: string;
	/** OAuth refresh token (long-lived) */
	refreshToken: string;
	/** Timestamp when access token expires (milliseconds) */
	expiresAt: number;
	/** Timestamp when credentials were created */
	createdAt: number;
	/** Session key these credentials belong to */
	sessionKey: string;
	/** Agent ID these credentials belong to */
	agentId: string;
	/** Google services authorized (gmail, calendar, drive, etc) */
	services: string[];
	/** Absolute path to this credentials file */
	filePath?: string;
}

/**
 * OAuth callback query parameters
 */
export interface OAuthCallbackParams {
	/** Authorization code from Google */
	code?: string;
	/** State token for CSRF validation */
	state?: string;
	/** Error code if authorization failed */
	error?: string;
	/** Human-readable error description */
	error_description?: string;
}

/**
 * Token exchange response from Google OAuth API
 */
export interface TokenExchangeResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	scope: string;
	token_type: string;
}

/**
 * Token refresh response from Google OAuth API
 */
export interface TokenRefreshResponse {
	access_token: string;
	expires_in: number;
	scope: string;
	token_type: string;
}

/**
 * Result from starting an OAuth flow
 */
export interface OAuthStartResult {
	/** OAuth authorization URL for user to visit */
	authUrl: string;
	/** State token for this flow */
	state: string;
	/** Seconds until this flow expires */
	expiresIn: number;
	/** Instructions for the user */
	instructions: string;
}

/**
 * Result from checking OAuth status
 */
export interface OAuthStatusResult {
	/** Whether credentials exist and are valid */
	authenticated: boolean;
	/** Google account email if authenticated */
	email?: string;
	/** Authorized services */
	services?: string[];
	/** Timestamp when access token expires */
	expiresAt?: number;
	/** Whether there's a pending auth flow */
	pending?: boolean;
}

/**
 * Result from revoking OAuth credentials
 */
export interface OAuthRevokeResult {
	/** Whether revocation was successful */
	success: boolean;
	/** Error message if revocation failed */
	error?: string;
}

/**
 * Google OAuth scope mappings
 */
export const GOOGLE_SERVICE_SCOPES: Record<string, string[]> = {
	gmail: [
		"https://www.googleapis.com/auth/gmail.readonly",
		"https://www.googleapis.com/auth/gmail.send",
		"https://www.googleapis.com/auth/gmail.modify",
		"https://www.googleapis.com/auth/gmail.labels",
	],
	calendar: [
		"https://www.googleapis.com/auth/calendar.readonly",
		"https://www.googleapis.com/auth/calendar.events",
	],
	drive: [
		"https://www.googleapis.com/auth/drive.readonly",
		"https://www.googleapis.com/auth/drive.file",
	],
	contacts: ["https://www.googleapis.com/auth/contacts.readonly"],
	docs: [
		"https://www.googleapis.com/auth/documents.readonly",
		"https://www.googleapis.com/auth/documents",
	],
	sheets: [
		"https://www.googleapis.com/auth/spreadsheets.readonly",
		"https://www.googleapis.com/auth/spreadsheets",
	],
};

/**
 * Get OAuth scopes for requested services
 */
export function getScopesForServices(services: string[]): string[] {
	const scopes = new Set<string>();
	for (const service of services) {
		const serviceScopes = GOOGLE_SERVICE_SCOPES[service];
		if (serviceScopes) {
			for (const scope of serviceScopes) {
				scopes.add(scope);
			}
		}
	}
	return Array.from(scopes);
}
