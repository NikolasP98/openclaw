/**
 * Approval gate middleware — human-in-the-loop confirmation before tool execution.
 *
 * Three modes per tool category:
 *   auto        — no gate (current default behaviour, always passes)
 *   confirm     — send confirmation request to user; wait for reply
 *   admin-only  — block unless the requesting user is an admin
 *
 * Tool categories:
 *   shell       — exec, bash, shell, run_command, execute, sh
 *   file_write  — write_file, create_file, edit_file, patch, apply_patch, delete_file, …
 *   network     — http, fetch, curl, web_request, post_request, webhook
 *   database    — query_db, execute_sql, db_write, insert_sql, update_sql, delete_sql
 *
 * Integration: call applyApprovalGate() inside runBeforeToolCallHook() after
 * autonomy enforcement. Add ApprovalContext to HookContext for wire-up.
 *
 * @module
 */

import type { ApprovalGateCategoryConfig } from "../config/types.approvals.js";

export type { ApprovalGateCategoryConfig };

// ── Types ──────────────────────────────────────────────────────────────────────

export type ApprovalMode = "auto" | "confirm" | "admin-only";

export type ToolCategory = "shell" | "file_write" | "network" | "database";

/** Injected context for the gate; both fields are optional for backward compatibility. */
export type ApprovalContext = {
  /** True if the requesting user has admin privileges. */
  isAdmin?: boolean;
  /**
   * Async callback that asks the user for confirmation.
   * Returns true (approved) or false (denied).
   * When absent and mode=confirm, the tool is blocked with APPROVAL_REQUIRED reason.
   */
  confirmFn?: ConfirmFn;
};

export type ConfirmFn = (toolName: string, category: ToolCategory) => Promise<boolean>;

export type ApprovalGateResult = { allowed: true } | { allowed: false; reason: string };

// ── Tool category classification ───────────────────────────────────────────────

const SHELL_TOOLS = new Set([
  "exec",
  "bash",
  "sh",
  "shell",
  "run_command",
  "execute",
  "run_bash",
  "run_shell",
  "terminal",
]);

const FILE_WRITE_TOOLS = new Set([
  "write_file",
  "create_file",
  "edit_file",
  "append_file",
  "delete_file",
  "move_file",
  "rename_file",
  "patch",
  "apply_patch",
  "str_replace_editor",
  "file_write",
  "write",
  "overwrite_file",
]);

const NETWORK_TOOLS = new Set([
  "http",
  "fetch",
  "curl",
  "web_request",
  "post_request",
  "webhook",
  "http_request",
  "make_request",
  "api_call",
]);

const DATABASE_TOOLS = new Set([
  "query_db",
  "execute_sql",
  "db_write",
  "insert_sql",
  "update_sql",
  "delete_sql",
  "run_query",
  "sql",
  "database_query",
]);

/**
 * Classify a tool name into its approval gate category.
 * Returns null for tools that don't fall into a gated category.
 */
export function classifyToolCategory(toolName: string): ToolCategory | null {
  const name = toolName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (SHELL_TOOLS.has(name)) return "shell";
  if (FILE_WRITE_TOOLS.has(name)) return "file_write";
  if (NETWORK_TOOLS.has(name)) return "network";
  if (DATABASE_TOOLS.has(name)) return "database";
  return null;
}

// ── Mode resolution ────────────────────────────────────────────────────────────

/**
 * Resolve the approval mode for a tool given the gate config.
 * Returns "auto" when the tool is uncategorised or has no explicit config.
 */
export function resolveApprovalMode(
  toolName: string,
  gateConfig: ApprovalGateCategoryConfig | undefined,
): ApprovalMode {
  if (!gateConfig) return "auto";
  const category = classifyToolCategory(toolName);
  if (!category) return "auto";
  return (gateConfig[category] as ApprovalMode | undefined) ?? "auto";
}

// ── Gate enforcement ───────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Apply the approval gate for a tool call.
 *
 * - mode=auto       → always allowed (fast path, no async work)
 * - mode=admin-only → allowed iff ctx.isAdmin === true
 * - mode=confirm    → calls ctx.confirmFn and waits (with timeout)
 *                     when confirmFn is absent, blocks with APPROVAL_REQUIRED
 */
export async function applyApprovalGate(
  toolName: string,
  gateConfig: ApprovalGateCategoryConfig | undefined,
  ctx: ApprovalContext,
): Promise<ApprovalGateResult> {
  const mode = resolveApprovalMode(toolName, gateConfig);

  if (mode === "auto") {
    return { allowed: true };
  }

  const category = classifyToolCategory(toolName) ?? ("unknown" as ToolCategory);

  if (mode === "admin-only") {
    if (ctx.isAdmin) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Tool "${toolName}" requires admin privileges (mode=admin-only).`,
    };
  }

  // mode === "confirm"
  if (!ctx.confirmFn) {
    return {
      allowed: false,
      reason: `APPROVAL_REQUIRED:${toolName} — no confirmation channel available.`,
    };
  }

  const timeoutMs = (gateConfig as { timeoutMs?: number } | undefined)?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const approved = await Promise.race([
      ctx.confirmFn(toolName, category),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ]);
    if (approved) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `Tool "${toolName}" confirmation denied or timed out.`,
    };
  } catch (err) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" confirmation failed: ${String(err)}`,
    };
  }
}
