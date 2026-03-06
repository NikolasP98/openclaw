/**
 * Obfuscated command detection guard — EE.1 (Sprint EE, Part IX).
 *
 * Detects shell commands that use common obfuscation patterns before they reach
 * the approval gate or execution layer. When detected, the caller should escalate
 * the command to require explicit user approval regardless of autonomy level.
 *
 * Patterns detected:
 *   - base64-piped-to-bash (echo <b64> | base64 -d | bash)
 *   - dynamic code eval via atob / Buffer.from
 *   - hex-escaped subshell substitutions
 *   - suspiciously long bash -c strings (>50 chars in the -c argument)
 *
 * @module
 */

// ── Detection patterns ─────────────────────────────────────────────────────

/** PCRE-style patterns that indicate likely command obfuscation. */
const OBFUSCATION_PATTERNS: RegExp[] = [
  // base64-piped-to-bash: echo <long-b64> | base64 -d | bash
  /echo\s+[A-Za-z0-9+/]{20,}={0,2}\s*\|\s*base64\s+-d\s*\|\s*(?:ba)?sh\b/i,
  // dynamic code strings decoded via atob or Buffer.from
  /\beval\s*\(\s*(?:atob\s*\(|Buffer\.from\s*\()/i,
  // hex-escaped subshell: $(... \x41 ...)
  /\$\(.*\\x[0-9a-fA-F]{2}/,
  // suspiciously long bash -c '...' argument
  /\bbash\s+-c\s+['"][^'"]{50,}['"]/i,
  // curl/wget piped to shell
  /(?:curl|wget)\s+[^\s|]+\s*\|\s*(?:ba)?sh\b/i,
];

export interface ObfuscationCheckResult {
  obfuscated: boolean;
  /** Which pattern matched (first match index, for diagnostics). */
  matchedPatternIndex?: number;
}

/**
 * Check whether a shell command string matches known obfuscation patterns.
 *
 * Returns { obfuscated: true } when the command looks suspicious.
 * Returns { obfuscated: false } for all other commands.
 */
export function checkForObfuscation(command: string): ObfuscationCheckResult {
  if (!command || typeof command !== "string") {
    return { obfuscated: false };
  }

  for (let i = 0; i < OBFUSCATION_PATTERNS.length; i++) {
    const pattern = OBFUSCATION_PATTERNS[i];
    if (pattern && pattern.test(command)) {
      return { obfuscated: true, matchedPatternIndex: i };
    }
  }

  return { obfuscated: false };
}

/**
 * Extract the command string from a tool's params object.
 * Handles both { command: string } and { cmd: string } shapes.
 */
export function extractCommandFromParams(params: unknown): string | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const p = params as Record<string, unknown>;
  if (typeof p.command === "string") {
    return p.command;
  }
  if (typeof p.cmd === "string") {
    return p.cmd;
  }
  return undefined;
}
