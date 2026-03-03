/**
 * Role-based tool policy presets for multi-agent pipelines.
 *
 * Named presets that map to tool allow/deny lists:
 * - `analysis`: read-only — can read files, search, grep but NOT write/exec
 * - `developer`: read-write — can read, write, exec but NOT deploy/push
 * - `verification`: read + test — can read, run tests but NOT write code
 *
 * Assignable per session via `sessions_spawn { role: "verification" }`.
 * Built on top of the existing tool policy infrastructure (tool-policy.ts).
 *
 * Inspired by Antfarm's role-based tool restriction pattern.
 */

// ── Types ────────────────────────────────────────────────────────────

export type PolicyPresetName = "analysis" | "developer" | "verification" | "full";

export interface ToolPolicyPreset {
  name: PolicyPresetName;
  description: string;
  /** Tools explicitly allowed (glob patterns). Empty = all allowed. */
  allow: string[];
  /** Tools explicitly denied (glob patterns). */
  deny: string[];
}

// ── Preset definitions ───────────────────────────────────────────────

const PRESETS: Record<PolicyPresetName, ToolPolicyPreset> = {
  analysis: {
    name: "analysis",
    description: "Read-only analysis — can read files, search, grep. Cannot write, exec, or modify.",
    allow: [
      "read", "grep", "find", "ls",
      "memory_search", "memory_get",
      "web_search", "web_fetch",
      "sessions_list",
    ],
    deny: [
      "write", "edit", "apply_patch",
      "exec", "shell", "bash",
      "fs_write", "fs_delete", "fs_move",
      "gateway", "sessions_spawn", "sessions_send",
      "cron",
    ],
  },

  developer: {
    name: "developer",
    description: "Read-write development — can read, write, exec. Cannot deploy, push, or manage gateway.",
    allow: [
      "read", "write", "edit", "apply_patch",
      "grep", "find", "ls",
      "exec",
      "memory_search", "memory_get",
      "web_search", "web_fetch",
    ],
    deny: [
      "gateway",
      "sessions_spawn", "sessions_send",
      "cron",
      "whatsapp_login",
    ],
  },

  verification: {
    name: "verification",
    description: "Verification — can read files, run tests, grep. Cannot write code or exec arbitrary commands.",
    allow: [
      "read", "grep", "find", "ls",
      "exec", // Needed for running tests (vitest, jest, etc.)
      "memory_search", "memory_get",
      "web_search", "web_fetch",
    ],
    deny: [
      "write", "edit", "apply_patch",
      "fs_write", "fs_delete", "fs_move",
      "gateway",
      "sessions_spawn", "sessions_send",
      "cron",
    ],
  },

  full: {
    name: "full",
    description: "Full access — all tools available (default).",
    allow: [],
    deny: [],
  },
};

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get a tool policy preset by name.
 * Returns undefined for unrecognized names.
 */
export function getPreset(name: string): ToolPolicyPreset | undefined {
  return PRESETS[name as PolicyPresetName];
}

/**
 * List all available preset names.
 */
export function listPresets(): PolicyPresetName[] {
  return Object.keys(PRESETS) as PolicyPresetName[];
}

/**
 * Convert a preset to the format expected by the tool policy pipeline
 * (compatible with SandboxToolPolicy shape).
 */
export function presetToPolicy(preset: ToolPolicyPreset): { allow: string[]; deny: string[] } {
  return { allow: preset.allow, deny: preset.deny };
}

/**
 * Check if a tool is allowed under a given preset.
 * Simple string matching — the actual glob matching is handled by
 * the existing tool-policy.ts pipeline.
 */
export function isToolAllowedByPreset(toolName: string, preset: ToolPolicyPreset): boolean {
  const normalized = toolName.toLowerCase().replace(/[-\s]/g, "_");

  // Check deny first (deny takes precedence).
  if (preset.deny.some((d) => normalized === d || normalized.startsWith(d + "_"))) {
    return false;
  }

  // If allow list is empty, everything not denied is allowed.
  if (preset.allow.length === 0) {
    return true;
  }

  // Check allow list.
  return preset.allow.some((a) => normalized === a || normalized.startsWith(a + "_"));
}
