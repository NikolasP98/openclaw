/**
 * gog_exec tool - Run gog CLI commands with auto-injected session credentials
 */

import { Type } from "@sinclair/typebox";
import { buildGogEnvironment } from "../../hooks/gog-command-exec.js";
import { getValidCredentials } from "../../hooks/gog-credentials.js";
import { runCommandWithTimeout } from "../../process/exec.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const GogExecSchema = Type.Object({
  command: Type.String({
    description:
      'The gog command to run (without the "gog" prefix). Example: \'gmail search "newer_than:7d" --max 10\'',
    minLength: 1,
  }),
  timeout: Type.Optional(
    Type.Number({
      description: "Timeout in seconds (default: 60, max: 300)",
      minimum: 5,
      maximum: 300,
    }),
  ),
});

export function createGogExecTool(opts?: { agentId?: string; sessionKey?: string }): AnyAgentTool {
  return {
    label: "Google Exec",
    name: "gog_exec",
    description:
      "Run gog CLI commands with auto-injected session credentials. Requires prior authentication via gog_auth_start. See the gog skill for command reference.",
    parameters: GogExecSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const command = readStringParam(params, "command", { required: true });
      const timeoutSec = Math.min((params.timeout as number) || 60, 300);

      if (!opts?.agentId || !opts?.sessionKey) {
        return jsonResult({
          error: "Missing agent context (agentId or sessionKey)",
        });
      }

      // Check if gog binary is available
      const gogCheck = await runCommandWithTimeout(["which", "gog"], { timeoutMs: 3_000 });
      if (gogCheck.code !== 0) {
        return jsonResult({
          error:
            "gog CLI is not installed on this server. " +
            "Ask the administrator to install it from https://github.com/steipete/gogcli/releases",
        });
      }

      // Get valid credentials (auto-refreshes if expired)
      const credentials = await getValidCredentials(opts.agentId, opts.sessionKey);
      if (!credentials) {
        return jsonResult({
          error:
            "Not authenticated with Google. Use gog_auth_start first to authorize, then retry.",
        });
      }

      // Parse command string into args (respects quoted strings)
      const commandArgs = parseCommandArgs(command);

      // Auto-inject --account flag if not present
      if (!commandArgs.includes("--account") && !commandArgs.includes("-a")) {
        const subcommandIndex = commandArgs.findIndex((arg) =>
          ["gmail", "calendar", "drive", "contacts", "docs", "sheets", "auth"].includes(arg),
        );
        if (subcommandIndex >= 0) {
          commandArgs.splice(subcommandIndex + 1, 0, "--account", credentials.email);
        }
      }

      // Build environment with keyring passthrough
      const env = await buildGogEnvironment({
        agentId: opts.agentId,
        sessionKey: opts.sessionKey,
        email: credentials.email,
      });

      // Execute gog command
      const result = await runCommandWithTimeout(["gog", ...commandArgs], {
        timeoutMs: timeoutSec * 1000,
        env,
      });

      if (result.killed || result.termination === "timeout") {
        return jsonResult({
          error: `Command timed out after ${timeoutSec}s`,
          stdout: result.stdout.slice(0, 2000),
          stderr: result.stderr.slice(0, 2000),
        });
      }

      if (result.code !== 0) {
        return jsonResult({
          error: `gog exited with code ${result.code}`,
          stdout: result.stdout,
          stderr: result.stderr,
        });
      }

      return jsonResult({
        stdout: result.stdout,
        stderr: result.stderr || undefined,
      });
    },
  };
}

/**
 * Parse a command string into an array of arguments, respecting quoted strings.
 * Handles single quotes, double quotes, and backslash escapes.
 */
function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (char === " " && !inSingle && !inDouble) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}
