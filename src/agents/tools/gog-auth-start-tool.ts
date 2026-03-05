/**
 * gog_auth_start tool - Start non-blocking Google OAuth flow
 *
 * Delegates URL building and scope resolution to GoogleAuthProvider.
 * Tool name kept as "gog_auth_start" for backward compatibility.
 */

import { Type } from "@sinclair/typebox";
import { createGoogleAuthProvider } from "../../auth/google/google-auth-provider.js";
import type { AuthProvider } from "../../auth/provider.js";
import { updateSessionStore, resolveDefaultSessionStorePath } from "../../config/sessions.js";
import {
  generateState,
  addPendingFlow,
  getServerPort,
  getRedirectUri,
} from "../../hooks/gog-oauth-server.js";
import type { PendingOAuthFlow, OAuthStartResult } from "../../hooks/gog-oauth-types.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

export function createGogAuthStartTool(opts?: {
  agentId?: string;
  agentDir?: string;
  sessionKey?: string;
}): AnyAgentTool {
  // Create provider once at tool creation time — used for both schema and execute
  const provider: AuthProvider = createGoogleAuthProvider();

  // Build service literals dynamically from provider
  const serviceLiterals = provider.getSupportedServices().map((s) => Type.Literal(s));

  const GogAuthStartSchema = Type.Object({
    email: Type.String({
      description: "Google account email address",
      minLength: 1,
    }),
    services: Type.Optional(
      Type.Array(Type.Union(serviceLiterals), {
        description: "Google services to authorize (default: gmail, calendar, drive)",
      }),
    ),
  });

  return {
    label: "Google Auth Start",
    name: "gog_auth_start",
    description:
      "Start non-blocking Google OAuth flow for Gmail, Calendar, Drive, and other Google services. Returns an authorization URL for the user to visit. The agent remains responsive while waiting for authorization. " +
      "IMPORTANT: Always use the default services (gmail, calendar, drive) unless the user explicitly requests only specific services. Do NOT narrow to a single service — users expect all Google services to work once authenticated.",
    parameters: GogAuthStartSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const email = readStringParam(params, "email", { required: true });
      let services = (params.services as string[] | undefined) || ["gmail", "calendar", "drive"];

      // Merge with existing credential services so re-auth never loses previously granted scopes
      if (opts?.agentId && opts?.sessionKey) {
        const existing = await provider.loadCredentials(opts.agentId, opts.sessionKey, email);
        if (existing?.services?.length) {
          services = [...new Set([...existing.services, ...services])];
        }
      }

      // Validate email format
      if (!email.includes("@")) {
        return jsonResult({
          error: "Invalid email address format",
        });
      }

      // Check if OAuth server is running
      const serverPort = getServerPort();
      if (!serverPort) {
        return jsonResult({
          error: "OAuth server is not running. Please contact the administrator.",
        });
      }

      if (!opts?.agentId || !opts?.agentDir || !opts?.sessionKey) {
        return jsonResult({
          error: "Missing agent context (agentId, agentDir, or sessionKey)",
        });
      }

      // Generate cryptographic state token
      const state = generateState();

      // Calculate expiry (5 minutes)
      const now = Date.now();
      const expiresAt = now + 5 * 60 * 1000;

      // Build OAuth authorization URL via provider
      const redirectUri = getRedirectUri();
      let authUrl: string;
      try {
        authUrl = provider.buildAuthUrl({ email, services, redirectUri, state });
      } catch {
        return jsonResult({
          error:
            "Google OAuth client ID not configured. Options (checked in order):\n" +
            "  1. Set hooks.gogOAuth.googleClientCredentialsFile in minion.json (path to downloaded Google client_secret JSON)\n" +
            "  2. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables\n" +
            "  3. Place gog CLI credentials in ~/.config/gogcli/credentials.json",
        });
      }

      // Create pending flow
      const flow: PendingOAuthFlow = {
        state,
        sessionKey: opts.sessionKey,
        agentId: opts.agentId,
        email,
        services,
        requestedAt: now,
        expiresAt,
        authUrl,
        providerId: provider.id,
      };

      // Store pending flow
      addPendingFlow(flow);

      // Update session entry with pending auth
      const storePath = resolveDefaultSessionStorePath(opts.agentId);
      await updateSessionStore(storePath, (store) => {
        const session = store[opts.sessionKey!];
        if (session) {
          session.gogAuthPending = {
            state,
            requestedAt: now,
            expiresAt,
            email,
            services,
          };
          session.updatedAt = Date.now();
        }
      });

      // Return result
      const result: OAuthStartResult = {
        authUrl,
        state,
        expiresIn: 300, // 5 minutes in seconds
        instructions:
          `IMPORTANT: You MUST paste the full authUrl as plain text in your response — do NOT wrap it in markdown link format like [text](url) or [url](url). ` +
          `The messaging platform auto-links plain URLs; markdown formatting breaks the URL and causes auth errors. ` +
          `Just paste the raw URL on its own line. ` +
          `The user will visit this link to authorize access to their Google account (${services.join(", ")}). ` +
          `You'll be notified when authentication completes (or if it times out after 5 minutes).`,
      };

      return jsonResult(result);
    },
  };
}
