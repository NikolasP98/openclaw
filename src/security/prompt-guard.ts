/**
 * PromptGuard — Inbound message injection scanner.
 *
 * Scans user-facing inbound messages for common prompt injection patterns
 * across 6 categories. Disabled by default (opt-in via config).
 *
 * Extends patterns from `external-content.ts` with more targeted category-based
 * scanning for pre-agent-loop validation.
 *
 * @module
 */

import { detectSuspiciousPatterns } from "./external-content.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type PromptGuardSensitivity = "low" | "medium" | "high";
export type PromptGuardAction = "warn" | "block" | "sanitize";

export type PromptGuardConfig = {
  enabled: boolean;
  sensitivity: PromptGuardSensitivity;
  action: PromptGuardAction;
};

export type PromptGuardResult = {
  flagged: boolean;
  categories: string[];
  action: "allow" | "warn" | "block";
  detail: string;
};

// ── Default config ───────────────────────────────────────────────────────────

export const DEFAULT_PROMPT_GUARD_CONFIG: PromptGuardConfig = {
  enabled: false,
  sensitivity: "medium",
  action: "warn",
};

// ── Category scanners ────────────────────────────────────────────────────────

type CategoryScanner = {
  name: string;
  /** Minimum sensitivity level required to activate this scanner. */
  minSensitivity: PromptGuardSensitivity;
  patterns: RegExp[];
};

const SENSITIVITY_ORDER: PromptGuardSensitivity[] = ["low", "medium", "high"];

function meetsMinSensitivity(
  current: PromptGuardSensitivity,
  minimum: PromptGuardSensitivity,
): boolean {
  return SENSITIVITY_ORDER.indexOf(current) >= SENSITIVITY_ORDER.indexOf(minimum);
}

const CATEGORY_SCANNERS: CategoryScanner[] = [
  {
    name: "system_override",
    minSensitivity: "low",
    patterns: [
      /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
      /disregard\s+(all\s+)?(previous|prior|above)/i,
      /forget\s+(everything|all|your)\s+(instructions?|rules?|guidelines?)/i,
      /new\s+instructions?:\s/i,
      /override\s+(system|safety|security)\s+(prompt|settings?|rules?)/i,
      /you\s+must\s+now\s+follow\s+these\s+instructions/i,
    ],
  },
  {
    name: "role_confusion",
    minSensitivity: "low",
    patterns: [
      /you\s+are\s+now\s+(a|an)\s+/i,
      /act\s+as\s+(a|an|if)\s+(you|your)/i,
      /pretend\s+(to\s+be|you\s+are)/i,
      /switch\s+to\s+(developer|admin|root|sudo)\s+mode/i,
      /enter\s+(DAN|jailbreak|unrestricted)\s+mode/i,
    ],
  },
  {
    name: "tool_injection",
    minSensitivity: "medium",
    patterns: [
      /\bexec\b.*command\s*=/i,
      /elevated\s*=\s*true/i,
      /tool_call\s*[\[({]/i,
      /\bfunction_call\b.*name\s*:/i,
      /<tool_use>|<\/tool_use>/i,
      /\btool_use\b.*\bid\b/i,
    ],
  },
  {
    name: "secret_extraction",
    minSensitivity: "low",
    patterns: [
      /reveal\s+(your|the|all)\s+(system\s+prompt|instructions?|api\s*keys?|secrets?|passwords?)/i,
      /show\s+me\s+(your|the)\s+(system|hidden|secret)\s+(prompt|instructions?)/i,
      /what\s+(are|is)\s+your\s+(system\s+prompt|instructions?|rules?)/i,
      /output\s+(your|the)\s+(full|complete|entire)\s+(system\s+prompt|instructions?)/i,
      /repeat\s+(the|your)\s+(system|initial)\s+(prompt|message|instructions?)/i,
    ],
  },
  {
    name: "command_injection",
    minSensitivity: "medium",
    patterns: [
      /rm\s+-rf\s+\//i,
      /;\s*(curl|wget|nc|netcat)\s+/i,
      /\|\s*sh\b/i,
      /`[^`]*(?:rm|curl|wget|nc)\s/i,
      /\$\([^)]*(?:rm|curl|wget|nc)\s/i,
      /delete\s+all\s+(emails?|files?|data|repos?|databases?)/i,
    ],
  },
  {
    name: "jailbreak",
    minSensitivity: "high",
    patterns: [
      /\bDAN\b/,
      /\bjailbreak\b/i,
      /do\s+anything\s+now/i,
      /without\s+(any\s+)?(restrictions?|limitations?|filters?|safety)/i,
      /bypass\s+(safety|content|security)\s+(filters?|measures?|checks?)/i,
      /uncensored\s+mode/i,
    ],
  },
];

// ── Main scanner ─────────────────────────────────────────────────────────────

/**
 * Scan an inbound user message for prompt injection patterns.
 *
 * Returns a result indicating whether the message was flagged, which
 * categories matched, and the recommended action.
 *
 * When `config.enabled` is false, always returns `{ flagged: false, action: "allow" }`.
 */
export function scanInboundMessage(
  content: string,
  config: PromptGuardConfig = DEFAULT_PROMPT_GUARD_CONFIG,
): PromptGuardResult {
  if (!config.enabled) {
    return { flagged: false, categories: [], action: "allow", detail: "" };
  }

  const categories: string[] = [];

  // Run category scanners
  for (const scanner of CATEGORY_SCANNERS) {
    if (!meetsMinSensitivity(config.sensitivity, scanner.minSensitivity)) {
      continue;
    }
    for (const pattern of scanner.patterns) {
      if (pattern.test(content)) {
        categories.push(scanner.name);
        break; // one match per category is enough
      }
    }
  }

  // Also check external-content suspicious patterns (they're complementary)
  const externalMatches = detectSuspiciousPatterns(content);
  if (externalMatches.length > 0 && !categories.includes("system_override")) {
    categories.push("system_override");
  }

  if (categories.length === 0) {
    return { flagged: false, categories: [], action: "allow", detail: "" };
  }

  const action = config.action === "block" ? "block" : "warn";
  const detail = `Prompt injection patterns detected in categories: ${categories.join(", ")}`;

  return { flagged: true, categories, action, detail };
}
