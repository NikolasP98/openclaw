/**
 * Command risk classification engine.
 *
 * Classifies shell commands into HIGH / MEDIUM / LOW risk tiers.
 * Used by the autonomy mode enforcement to block or warn about
 * dangerous commands depending on the configured security posture.
 *
 * Inspired by ZeroClaw's `src/safety/policy.rs` and IronClaw's
 * `src/safety/validator.rs`.
 */

import { extractBaseCommand, tokenize, detectInjection } from "./shell-lexer.js";

// ── Types ────────────────────────────────────────────────────────────

export type RiskLevel = "high" | "medium" | "low";

export type AutonomyMode = "readonly" | "supervised" | "full";

export interface RiskAssessment {
  /** Overall risk level (highest across all sub-commands). */
  level: RiskLevel;
  /** The specific sub-command that triggered the highest risk. */
  trigger: string;
  /** Human-readable reason for the classification. */
  reason: string;
  /** Whether shell injection was detected. */
  injectionDetected: boolean;
}

// ── Risk patterns ────────────────────────────────────────────────────

/**
 * HIGH risk: destructive, irreversible, or system-level operations.
 * These should be blocked in readonly and supervised modes.
 */
const HIGH_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+-[rf]{1,2}[rf]?\b/, reason: "recursive/forced file deletion" },
  { pattern: /\brm\s+--no-preserve-root\b/, reason: "root filesystem deletion" },
  { pattern: /\b(mkfs|fdisk|parted|diskpart)\b/, reason: "disk formatting/partitioning" },
  { pattern: /\bdd\s+/, reason: "raw disk write (dd)" },
  { pattern: /\b(shutdown|reboot|poweroff|halt|init\s+[06])\b/, reason: "system power control" },
  { pattern: /\bchmod\s+777\b/, reason: "world-writable permissions" },
  { pattern: /\bchmod\s+-R\b/, reason: "recursive permission change" },
  { pattern: /\bchown\s+-R\b/, reason: "recursive ownership change" },
  { pattern: /:\(\)\s*\{.*\};\s*:/, reason: "fork bomb" },
  { pattern: />\s*\/dev\/sd[a-z]/, reason: "direct device write" },
  { pattern: /\bkill\s+-9\b/, reason: "force kill process" },
  { pattern: /\bkillall\b/, reason: "kill all matching processes" },
  { pattern: /\bpkill\s+-9\b/, reason: "force kill by name" },
  { pattern: /\bsudo\s/, reason: "elevated privileges (sudo)" },
  { pattern: /\bsu\s+-?\s*$/, reason: "switch to root" },
  { pattern: /\biptables\b/, reason: "firewall modification" },
  { pattern: /\bufw\s+(disable|reset|delete)\b/, reason: "firewall modification" },
  { pattern: />\s*\/etc\//, reason: "overwrite system config" },
  { pattern: /\bcurl\b.*\|\s*(sh|bash|zsh)/, reason: "remote code execution via curl pipe" },
  { pattern: /\bwget\b.*\|\s*(sh|bash|zsh)/, reason: "remote code execution via wget pipe" },
];

/**
 * MEDIUM risk: network, package management, deployment, version control push.
 * These should require approval in supervised mode, allowed in full mode.
 */
const MEDIUM_RISK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bnpm\s+(install|i|add|uninstall|remove)\b/, reason: "package installation/removal" },
  { pattern: /\byarn\s+(add|remove|install)\b/, reason: "package installation/removal" },
  { pattern: /\bpnpm\s+(add|remove|install)\b/, reason: "package installation/removal" },
  { pattern: /\bpip\s+install\b/, reason: "Python package installation" },
  { pattern: /\bgit\s+push\b/, reason: "push to remote repository" },
  { pattern: /\bgit\s+reset\s+--hard\b/, reason: "hard git reset (destructive)" },
  { pattern: /\bgit\s+force-push\b/, reason: "force push (destructive)" },
  { pattern: /\bgit\s+push\s+.*--force\b/, reason: "force push (destructive)" },
  { pattern: /\bdocker\s+(run|build|pull|push|rm|stop|kill)\b/, reason: "Docker container operation" },
  { pattern: /\bsystemctl\s+(start|stop|restart|enable|disable)\b/, reason: "systemd service control" },
  { pattern: /\bcurl\s+(-X\s+(POST|PUT|DELETE|PATCH)\b|--data\b)/, reason: "HTTP mutation request" },
  { pattern: /\bssh\s+/, reason: "remote shell access" },
  { pattern: /\bscp\s+/, reason: "remote file transfer" },
  { pattern: /\brsync\b/, reason: "remote file synchronization" },
  { pattern: /\bchmod\s+[0-7]{3}\b/, reason: "file permission change" },
  { pattern: /\bmkdir\s+-p\b/, reason: "directory creation" },
  { pattern: /\brm\s+(?!-[rf])/, reason: "file deletion (non-recursive)" },
];

/**
 * LOW risk: read-only, informational, or local-only operations.
 * These are always allowed regardless of autonomy mode.
 */
const LOW_RISK_COMMANDS = new Set([
  "ls", "ll", "la", "dir",
  "cat", "head", "tail", "less", "more",
  "grep", "rg", "ag", "ack",
  "find", "locate", "which", "whereis", "type",
  "echo", "printf", "wc", "sort", "uniq", "diff",
  "pwd", "cd", "basename", "dirname", "realpath",
  "date", "cal", "uptime", "whoami", "hostname",
  "ps", "top", "htop", "free", "df", "du",
  "git", // bare `git` — specific subcommands checked above
  "git status", "git log", "git diff", "git show", "git branch",
  "node", "npx", "tsc", "vitest", "jest", "eslint", "prettier",
  "man", "help", "env", "printenv",
]);

// ── Classification ───────────────────────────────────────────────────

/**
 * Classify a shell command string into a risk level.
 *
 * The command is tokenized into sub-commands (respecting quotes), and
 * each sub-command is independently classified.  The overall risk is
 * the highest risk found across all sub-commands.
 */
export function classifyCommandRisk(command: string): RiskAssessment {
  // Check for injection first — always HIGH.
  if (detectInjection(command)) {
    return {
      level: "high",
      trigger: command,
      reason: "shell injection pattern detected",
      injectionDetected: true,
    };
  }

  const tokens = tokenize(command);
  let worstLevel: RiskLevel = "low";
  let worstTrigger = command;
  let worstReason = "no risk patterns detected";

  for (const token of tokens) {
    const assessment = classifySingleCommand(token.command);
    if (riskOrd(assessment.level) > riskOrd(worstLevel)) {
      worstLevel = assessment.level;
      worstTrigger = assessment.trigger;
      worstReason = assessment.reason;
    }
  }

  return {
    level: worstLevel,
    trigger: worstTrigger,
    reason: worstReason,
    injectionDetected: false,
  };
}

function classifySingleCommand(command: string): RiskAssessment {
  // Check HIGH risk patterns.
  for (const { pattern, reason } of HIGH_RISK_PATTERNS) {
    if (pattern.test(command)) {
      return { level: "high", trigger: command, reason, injectionDetected: false };
    }
  }

  // Check MEDIUM risk patterns.
  for (const { pattern, reason } of MEDIUM_RISK_PATTERNS) {
    if (pattern.test(command)) {
      return { level: "medium", trigger: command, reason, injectionDetected: false };
    }
  }

  // Check if the base command is known-low-risk.
  const base = extractBaseCommand(command);
  if (LOW_RISK_COMMANDS.has(base)) {
    return { level: "low", trigger: command, reason: `known safe command: ${base}`, injectionDetected: false };
  }

  // Unknown commands default to MEDIUM (conservative).
  return { level: "medium", trigger: command, reason: `unknown command: ${base}`, injectionDetected: false };
}

function riskOrd(level: RiskLevel): number {
  switch (level) {
    case "low": return 0;
    case "medium": return 1;
    case "high": return 2;
  }
}

// ── Autonomy enforcement ─────────────────────────────────────────────

export interface AutonomyDecision {
  allowed: boolean;
  reason: string;
  risk: RiskAssessment;
}

/**
 * Decide whether a command should be allowed under the given autonomy mode.
 *
 * - `readonly`:    Only LOW risk commands allowed.
 * - `supervised`:  LOW always allowed.  MEDIUM/HIGH require explicit approval (returns allowed=false with reason).
 * - `full`:        Everything allowed (risk still reported for logging).
 */
export function enforceAutonomy(command: string, mode: AutonomyMode): AutonomyDecision {
  const risk = classifyCommandRisk(command);

  if (mode === "full") {
    return { allowed: true, reason: "full autonomy mode", risk };
  }

  if (mode === "readonly") {
    if (risk.level === "low") {
      return { allowed: true, reason: "read-only: safe command", risk };
    }
    return {
      allowed: false,
      reason: `blocked in readonly mode: ${risk.reason} (risk: ${risk.level})`,
      risk,
    };
  }

  // supervised
  if (risk.level === "low") {
    return { allowed: true, reason: "supervised: safe command", risk };
  }
  return {
    allowed: false,
    reason: `requires approval in supervised mode: ${risk.reason} (risk: ${risk.level})`,
    risk,
  };
}
