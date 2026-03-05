/**
 * gog_exec tool - Run gog CLI commands with auto-injected session credentials
 */

import { Type } from "@sinclair/typebox";
import { buildGogEnvironment } from "../../hooks/gog-command-exec.js";
import { getValidCredentials, importTokensToGogKeyring } from "../../hooks/gog-credentials.js";
import { runCommandWithTimeout } from "../../platform/process/exec.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const GogExecSchema = Type.Object({
  command: Type.String({
    description:
      'The gog command to run (without the "gog" prefix). Example: \'gmail search "newer_than:7d" --max 10\'',
    minLength: 1,
  }),
  json: Type.Optional(
    Type.Boolean({
      description: "Auto-append --json flag and parse output as structured data (default: false)",
    }),
  ),
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
      "Run gog CLI commands with auto-injected session credentials. Requires prior authentication via gog_auth_start. See the gog skill for command reference. " +
      "If this tool returns a scope/permission error, IMMEDIATELY call gog_auth_start with the missing service — do NOT try workarounds or alternative commands. " +
      "IMPORTANT: When this tool returns data (file lists, emails, events), you MUST include the actual content in your reply to the user — do NOT just summarize or say 'here is the list' without showing it.",
    parameters: GogExecSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const command = readStringParam(params, "command", { required: true });
      const wantJson = params.json === true;
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
      const credResult = await getValidCredentials(opts.agentId, opts.sessionKey);
      if (!credResult.credentials) {
        const detail = credResult.refreshFailed
          ? `Google token refresh failed: ${credResult.error}. Re-authenticate with gog_auth_start.`
          : "Not authenticated with Google. Use gog_auth_start first to authorize, then retry.";
        return jsonResult({ error: detail });
      }
      const credentials = credResult.credentials;

      // Parse command string into args (respects quoted strings)
      const commandArgs = parseCommandArgs(command);

      // Pre-check: does the credential have the required service for this command?
      const targetService = commandArgs.find((arg) =>
        ["gmail", "calendar", "drive", "contacts", "docs", "sheets"].includes(arg),
      );
      if (targetService && !credentials.services.includes(targetService)) {
        const allServices = [...new Set([...credentials.services, targetService])];
        return jsonResult({
          error:
            `SCOPE MISSING: Current credentials for ${credentials.email} only have scopes for: ${credentials.services.join(", ")}. ` +
            `The "${targetService}" service is not authorized. ` +
            `ACTION REQUIRED: Call gog_auth_start NOW with email="${credentials.email}" and services=[${allServices.map((s) => `"${s}"`).join(", ")}]. ` +
            `Do NOT retry this command or try alternative commands — authentication must be expanded first.`,
        });
      }

      // Auto-inject --account flag if not present
      if (!commandArgs.includes("--account") && !commandArgs.includes("-a")) {
        const subcommandIndex = commandArgs.findIndex((arg) =>
          ["gmail", "calendar", "drive", "contacts", "docs", "sheets", "auth"].includes(arg),
        );
        if (subcommandIndex >= 0) {
          commandArgs.splice(subcommandIndex + 1, 0, "--account", credentials.email);
        }
      }

      // Auto-append --json if requested and not already present
      if (wantJson && !commandArgs.includes("--json")) {
        commandArgs.push("--json");
      }

      // Build environment with keyring passthrough
      const env = await buildGogEnvironment({
        agentId: opts.agentId,
        sessionKey: opts.sessionKey,
        email: credentials.email,
      });

      // Just-in-time token sync: ensure gog CLI keyring has current tokens
      // This self-heals if a prior sync failed (e.g. typo, version mismatch, crash)
      // Non-fatal: some gog commands may work without keyring sync (e.g. token passed via env)
      const syncResult = await importTokensToGogKeyring(credentials, env);
      let keyringSyncWarning: string | undefined;
      if (!syncResult.success) {
        keyringSyncWarning = `Keyring sync failed: ${syncResult.error}. The gog command will still be attempted.`;
      }

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
        // Detect Google API scope errors and provide actionable guidance
        const isScopeError = /insufficientPermissions|insufficient.*scopes?|403/i.test(
          result.stderr,
        );
        const scopeHint = isScopeError
          ? `\nSCOPE ERROR: The current token was not granted "${targetService || "the required"}" permissions. ` +
            `ACTION REQUIRED: Call gog_auth_start NOW with email="${credentials.email}" and services=["gmail", "calendar", "drive"] to fix this. ` +
            `Do NOT retry this command or try alternative commands.`
          : "";

        return jsonResult({
          error: `gog exited with code ${result.code}${scopeHint}`,
          stdout: result.stdout,
          stderr: result.stderr,
          keyringSyncWarning,
        });
      }

      // Parse JSON output if requested
      if (wantJson) {
        try {
          const parsed = JSON.parse(result.stdout);
          return jsonResult({ data: parsed, stderr: result.stderr || undefined });
        } catch {
          // JSON parse failed — return raw output with a note
          return jsonResult({
            stdout: result.stdout,
            stderr: result.stderr || undefined,
            warning: "json=true was set but output was not valid JSON",
          });
        }
      }

      return jsonResult({
        stdout: result.stdout,
        stderr: result.stderr || undefined,
        keyringSyncWarning,
      });
    },
  };
}

/**
 * Parse a command string into an array of arguments, respecting quoted strings.
 * - Single quotes: literal (no escape interpretation)
 * - Double quotes: interprets \n, \t, \\, \"
 * - Unquoted backslash: escapes next character
 *
 * Note: Does not handle shell-specific $'...' ANSI-C quoting or heredocs.
 * For multi-line content, prefer --body-file with a temp file instead.
 */
function parseCommandArgs(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  const DOUBLE_QUOTE_ESCAPES: Record<string, string> = {
    n: "\n",
    t: "\t",
    "\\": "\\",
    '"': '"',
  };

  for (const char of command) {
    if (escaped) {
      if (inDouble) {
        // Inside double quotes: interpret \n, \t, \\, \"
        current += DOUBLE_QUOTE_ESCAPES[char] ?? `\\${char}`;
      } else {
        // Outside quotes: backslash just escapes the next char literally
        current += char;
      }
      escaped = false;
      continue;
    }

    if (char === "\\" && !inSingle) {
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
