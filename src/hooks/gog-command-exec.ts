/**
 * Utilities for executing gog commands with session-aware credentials
 */

import { spawn } from "child_process";
import type { SpawnOptions } from "child_process";
import { getValidCredentials } from "./gog-credentials.js";

/**
 * Context for executing gog commands
 */
export interface GogCommandContext {
  /** Agent ID for credential lookup */
  agentId: string;
  /** Session key for credential isolation */
  sessionKey?: string;
  /** Email to use (optional, will auto-detect from session) */
  email?: string;
}

/**
 * Build environment for gog commands.
 * Inherits all process.env (including GOG_KEYRING_BACKEND, GOG_KEYRING_PASSWORD
 * needed for file-based keyring on headless servers) and merges extra vars on top.
 */
function buildGogEnv(extraEnv?: Record<string, string>): NodeJS.ProcessEnv {
  return extraEnv ? { ...process.env, ...extraEnv } : { ...process.env };
}

/**
 * Execute a gog command with session credentials if available
 * Falls back to global gogcli credentials if no session credentials exist
 */
export async function executeGogCommand(
  args: string[],
  context: GogCommandContext,
  options?: SpawnOptions,
): Promise<ReturnType<typeof spawn>> {
  let extraEnv: Record<string, string> = {};

  // Try to load session credentials if sessionKey is provided
  if (context.sessionKey) {
    const credentials = await getValidCredentials(
      context.agentId,
      context.sessionKey,
      context.email,
    );

    if (credentials) {
      extraEnv = { GOG_ACCOUNT: credentials.email };

      // Also add --account flag if not already present
      if (!args.includes("--account") && !args.includes("-a")) {
        // Insert account flag after the command (e.g., after "gmail", "calendar")
        const commandIndex = args.findIndex((arg) =>
          ["gmail", "calendar", "drive", "contacts", "docs", "sheets"].includes(arg),
        );
        if (commandIndex >= 0) {
          args.splice(commandIndex + 1, 0, "--account", credentials.email);
        }
      }
    }
  }

  const env = buildGogEnv(extraEnv);

  // Execute gog command with modified environment
  return spawn("gog", args, {
    ...options,
    env,
  });
}

/**
 * Build environment for gog command with session credentials
 * Useful for tools that need to set up environment before spawning
 */
export async function buildGogEnvironment(context: GogCommandContext): Promise<NodeJS.ProcessEnv> {
  const extraEnv: Record<string, string> = {};

  if (context.sessionKey) {
    const credentials = await getValidCredentials(
      context.agentId,
      context.sessionKey,
      context.email,
    );

    if (credentials) {
      extraEnv.GOG_ACCOUNT = credentials.email;
    }
  }

  return buildGogEnv(extraEnv);
}

/**
 * Add account flag to gog command args if credentials exist
 */
export async function addAccountFlag(
  args: string[],
  context: GogCommandContext,
): Promise<string[]> {
  if (!context.sessionKey) {
    return args;
  }

  const credentials = await getValidCredentials(context.agentId, context.sessionKey, context.email);

  if (!credentials) {
    return args;
  }

  // Don't add if already present
  if (args.includes("--account") || args.includes("-a")) {
    return args;
  }

  // Insert account flag after the subcommand
  const commandIndex = args.findIndex((arg) =>
    ["gmail", "calendar", "drive", "contacts", "docs", "sheets"].includes(arg),
  );

  if (commandIndex >= 0) {
    const newArgs = [...args];
    newArgs.splice(commandIndex + 1, 0, "--account", credentials.email);
    return newArgs;
  }

  return args;
}
