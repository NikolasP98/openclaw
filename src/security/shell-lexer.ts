/**
 * Quote-aware shell tokenizer for command risk analysis.
 *
 * Splits compound shell commands on unquoted operators (`;`, `|`, `&&`, `||`)
 * so each sub-command can be independently classified.  Also detects injection
 * patterns where a benign-looking string hides a dangerous payload.
 *
 * Inspired by ZeroClaw's command-validation lexer.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface ShellToken {
  /** The raw text of this sub-command (trimmed). */
  command: string;
  /** The operator that *preceded* this sub-command (";" | "|" | "&&" | "||" | "start"). */
  operator: string;
}

// ── Core lexer ───────────────────────────────────────────────────────

/**
 * Tokenize a shell command string into sub-commands, splitting on unquoted
 * `;`, `|`, `&&`, and `||`.  Respects single quotes, double quotes, and
 * backslash escapes.
 *
 * ```
 * tokenize('echo "hello; world" && rm -rf /')
 * // → [
 * //     { command: 'echo "hello; world"', operator: 'start' },
 * //     { command: 'rm -rf /',            operator: '&&'    },
 * //   ]
 * ```
 */
export function tokenize(input: string): ShellToken[] {
  const tokens: ShellToken[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let pendingOp = "start";

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      current += ch;
      continue;
    }

    // Toggle quote state.
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    // Inside quotes — everything is literal.
    if (inSingle || inDouble) {
      current += ch;
      continue;
    }

    // Operator detection (outside quotes).
    if (ch === ";" || ch === "|" || ch === "&") {
      // Two-char operators: `||`, `&&`
      const next = input[i + 1];
      if (ch === "|" && next === "|") {
        pushToken(tokens, current, pendingOp);
        current = "";
        pendingOp = "||";
        i++; // skip second char
        continue;
      }
      if (ch === "&" && next === "&") {
        pushToken(tokens, current, pendingOp);
        current = "";
        pendingOp = "&&";
        i++;
        continue;
      }
      if (ch === ";") {
        pushToken(tokens, current, pendingOp);
        current = "";
        pendingOp = ";";
        continue;
      }
      if (ch === "|") {
        pushToken(tokens, current, pendingOp);
        current = "";
        pendingOp = "|";
        continue;
      }
      // Lone `&` (background) — treat as operator.
      if (ch === "&") {
        pushToken(tokens, current, pendingOp);
        current = "";
        pendingOp = "&";
        continue;
      }
    }

    current += ch;
  }

  // Flush remaining.
  pushToken(tokens, current, pendingOp);
  return tokens;
}

function pushToken(tokens: ShellToken[], raw: string, operator: string): void {
  const command = raw.trim();
  if (command) {
    tokens.push({ command, operator });
  }
}

// ── Injection detection ──────────────────────────────────────────────

/**
 * Detect likely shell injection patterns.
 *
 * Returns `true` if the input appears to contain an injected payload —
 * i.e. multiple sub-commands where at least one is piped through `sh`/`bash`,
 * or the classic `curl … | sh` / `$()` / backtick patterns.
 */
export function detectInjection(input: string): boolean {
  const tokens = tokenize(input);

  // Single command — no injection via operators.
  if (tokens.length <= 1) {
    // Still check for inline execution patterns.
    return hasInlineExecution(input);
  }

  // Multiple sub-commands — check if any are suspicious execution targets.
  for (const token of tokens) {
    if (isShellExecTarget(token.command)) {
      return true;
    }
  }

  // Pipe chains ending in `sh`, `bash`, `node`, `python`, etc.
  const pipeTarget = tokens[tokens.length - 1];
  if (pipeTarget && pipeTarget.operator === "|") {
    const cmd = extractBaseCommand(pipeTarget.command);
    if (SHELL_INTERPRETERS.has(cmd)) {
      return true;
    }
  }

  return false;
}

/** Shells / interpreters commonly used as injection targets. */
const SHELL_INTERPRETERS = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "dash",
  "node",
  "python",
  "python3",
  "perl",
  "ruby",
  "eval",
]);

/** Known dangerous command patterns that indicate injection. */
function isShellExecTarget(command: string): boolean {
  const base = extractBaseCommand(command);
  // Executing from a pipe/redirect into a shell.
  if (SHELL_INTERPRETERS.has(base) && command.includes("-c")) {
    return true;
  }
  return false;
}

/** Check for inline execution: `$(...)`, backticks. */
function hasInlineExecution(input: string): boolean {
  // $(...) command substitution — common injection vector.
  if (/\$\(/.test(input)) {
    return true;
  }
  // Backtick command substitution.
  if (/`[^`]+`/.test(input)) {
    return true;
  }
  return false;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract the base command name from a full command string.
 * Handles: `sudo cmd`, `env VAR=val cmd`, `/usr/bin/cmd`, `cmd args...`
 */
export function extractBaseCommand(command: string): string {
  const parts = command.trim().split(/\s+/);
  let idx = 0;

  // Skip `sudo`, `env`, `nohup`, `nice` prefixes.
  const PREFIXES = new Set(["sudo", "env", "nohup", "nice", "time", "timeout", "strace"]);
  while (idx < parts.length && parts[idx] && PREFIXES.has(parts[idx]!)) {
    idx++;
    // `env` may have VAR=VAL assignments before the real command.
    while (idx < parts.length && parts[idx]?.includes("=")) {
      idx++;
    }
  }

  const raw = parts[idx] ?? "";
  // Strip path: `/usr/bin/rm` → `rm`
  const slashIdx = raw.lastIndexOf("/");
  return slashIdx >= 0 ? raw.slice(slashIdx + 1) : raw;
}
