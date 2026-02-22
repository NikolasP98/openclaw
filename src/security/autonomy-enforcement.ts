/**
 * Autonomy enforcement hook for tool dispatch.
 *
 * Integrates command-risk classification with the before-tool-call hook pipeline.
 * Called for exec-like tools (shell, exec, apply_patch) to classify and enforce
 * the configured autonomy level.
 *
 * Usage in pi-tools.before-tool-call.ts:
 *   import { checkCommandAutonomy } from "../security/autonomy-enforcement.js";
 *   // ... inside runBeforeToolCallHook:
 *   const autonomyResult = checkCommandAutonomy({ toolName, params, config });
 *   if (autonomyResult?.blocked) return autonomyResult;
 */

import type { MinionConfig } from "../config/config.js";
import type { AutonomyMode } from "./command-risk.js";
import { classifyCommandRisk, enforceAutonomy } from "./command-risk.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("security/autonomy");

/** Tool names that carry shell commands in their params. */
const EXEC_TOOL_NAMES = new Set([
  "exec",
  "shell",
  "bash",
  "shell_exec",
  "apply_patch",
]);

/**
 * Extract the command string from tool params.
 * Different tools use different param keys.
 */
function extractCommand(toolName: string, params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const p = params as Record<string, unknown>;

  // Common param names for the command string.
  for (const key of ["command", "cmd", "script", "input"]) {
    if (typeof p[key] === "string" && p[key]) {
      return p[key] as string;
    }
  }

  // apply_patch — the patch content itself isn't a shell command.
  if (toolName === "apply_patch") return undefined;

  return undefined;
}

export type AutonomyCheckResult =
  | { blocked: true; reason: string }
  | { blocked: false }
  | null; // null = not applicable (not an exec tool)

/**
 * Check whether a tool call should be allowed under the current autonomy config.
 *
 * Returns `null` if the tool is not an exec-like tool (no check needed).
 * Returns `{ blocked: false }` if allowed.
 * Returns `{ blocked: true, reason }` if the command is blocked by the autonomy mode.
 */
export function checkCommandAutonomy(params: {
  toolName: string;
  toolParams: unknown;
  config: MinionConfig | undefined;
}): AutonomyCheckResult {
  const { toolName, toolParams, config } = params;
  const normalized = toolName.toLowerCase().replace(/[-_\s]/g, "_");

  // Only check exec-like tools.
  if (!EXEC_TOOL_NAMES.has(normalized)) {
    return null;
  }

  const mode: AutonomyMode = config?.security?.level ?? "full";

  // Full mode — always allow, but still log risk.
  if (mode === "full") {
    const command = extractCommand(toolName, toolParams);
    if (command) {
      const risk = classifyCommandRisk(command);
      if (risk.level !== "low") {
        log.debug(`[autonomy:full] ${risk.level} risk command allowed: ${risk.reason}`);
      }
    }
    return { blocked: false };
  }

  const command = extractCommand(toolName, toolParams);
  if (!command) {
    // No command extracted — can't classify. In readonly mode, block unknown.
    if (mode === "readonly") {
      return { blocked: true, reason: "readonly mode: could not extract command for risk assessment" };
    }
    return { blocked: false };
  }

  const decision = enforceAutonomy(command, mode);

  if (!decision.allowed) {
    log.warn(
      `[autonomy:${mode}] BLOCKED: ${decision.reason} | command: ${command.slice(0, 100)}`,
    );
    return { blocked: true, reason: decision.reason };
  }

  return { blocked: false };
}
