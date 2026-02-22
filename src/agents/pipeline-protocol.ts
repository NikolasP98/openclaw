/**
 * STATUS:/KEY: inter-agent output protocol.
 *
 * Parses structured output from sub-agent sessions to enable reliable
 * handoffs in multi-agent pipelines. Agents end their output with:
 *   STATUS: done
 *   FINDINGS: list of issues
 *   ISSUES: missing error handling on line 42
 *
 * The orchestrator parses these and populates {{key}} template variables
 * in the next pipeline step's input prompt.
 *
 * Inspired by Antfarm's STATUS: protocol (50 lines of regex, zero infra).
 */

// ── Types ────────────────────────────────────────────────────────────

export type PipelineStatus = "done" | "retry" | "fail";

export interface ParsedPipelineOutput {
  /** Parsed status (defaults to "done" if not found). */
  status: PipelineStatus;
  /** Extracted KEY: value pairs. */
  fields: Record<string, string>;
  /** The raw output (unmodified). */
  rawOutput: string;
  /** Whether a STATUS: line was explicitly found. */
  hasExplicitStatus: boolean;
}

// ── Parser ───────────────────────────────────────────────────────────

const STATUS_RE = /^STATUS:\s*(done|retry|fail)\s*$/im;
const FIELD_RE = /^([A-Z][A-Z_]{1,30}):\s*(.+)$/gm;
const RESERVED_KEYS = new Set(["STATUS"]);

/**
 * Parse structured output from an agent session.
 *
 * Extracts STATUS: and KEY: value pairs from the output text.
 * Lines not matching the pattern are ignored.
 *
 * Returns { status, fields } where fields is a Record<string, string>
 * ready for template variable substitution.
 */
export function parsePipelineOutput(output: string): ParsedPipelineOutput {
  // Extract STATUS.
  const statusMatch = output.match(STATUS_RE);
  const status: PipelineStatus = statusMatch
    ? (statusMatch[1]!.toLowerCase() as PipelineStatus)
    : "done";

  // Extract KEY: value pairs.
  const fields: Record<string, string> = {};
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex.
  FIELD_RE.lastIndex = 0;
  while ((match = FIELD_RE.exec(output)) !== null) {
    const key = match[1]!;
    const value = match[2]!.trim();
    if (!RESERVED_KEYS.has(key)) {
      fields[key] = value;
    }
  }

  return {
    status,
    fields,
    rawOutput: output,
    hasExplicitStatus: statusMatch !== null,
  };
}

// ── Template substitution ────────────────────────────────────────────

/**
 * Substitute {{KEY}} placeholders in a template with values from parsed output.
 *
 * Unmatched placeholders are left as-is (the agent can see what's expected).
 */
export function applyPipelineTemplate(
  template: string,
  fields: Record<string, string>,
): string {
  return template.replace(/\{\{([A-Z][A-Z_]{1,30})\}\}/g, (match, key: string) => {
    return fields[key] ?? match;
  });
}

// ── Pipeline step definition ─────────────────────────────────────────

export interface PipelineStep {
  /** Step name (for logging/display). */
  name: string;
  /** Prompt template (may include {{KEY}} placeholders). */
  promptTemplate: string;
  /** Tool policy role for this step (optional). */
  role?: string;
  /** Maximum retries if status is "retry" (default: 1). */
  maxRetries?: number;
}

/**
 * Build the prompt for a pipeline step, substituting fields from
 * the previous step's output.
 */
export function buildStepPrompt(step: PipelineStep, previousOutput?: ParsedPipelineOutput): string {
  if (!previousOutput) {
    return step.promptTemplate;
  }
  return applyPipelineTemplate(step.promptTemplate, previousOutput.fields);
}
