/**
 * Complexity scorer — maps a conversation turn to a 0.0–1.0 complexity score
 * and a model-tier recommendation.
 *
 * This is a pure function with no side effects. The caller (router) is
 * responsible for deciding whether the score overrides an explicit env-var tier.
 *
 * Tiers:
 *   Nano   < 0.20  — local Ollama (<7B), trivial chat
 *   Micro  0.20–0.50 — Haiku / Flash, simple tasks
 *   Base   0.50–0.85 — Sonnet / GPT-4o, typical coding/reasoning
 *   Expert > 0.85  — Opus / o3, deep multi-step reasoning
 *
 * @module
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskType = "chat" | "code" | "research" | "reasoning";

export type ModelTier = "nano" | "micro" | "base" | "expert";

export type ComplexityInput = {
  /** The current user message text. */
  message: string;
  /** Number of tool calls made in the last 5 turns. */
  recentToolCalls?: number;
  /** Whether any code blocks appear in the conversation context. */
  hasCodeBlocks?: boolean;
  /** Explicit task type hint, if known by the caller. */
  taskType?: TaskType;
};

export type ComplexityResult = {
  /** Normalised complexity score in [0, 1]. */
  score: number;
  /** Recommended model tier. */
  tier: ModelTier;
  /** Task type inferred or forwarded from input. */
  taskType: TaskType;
};

// ── Constants ─────────────────────────────────────────────────────────────────

/** Token count at which the message-length component saturates at 1.0. */
const TOKEN_SATURATION = 2000;

const REASONING_MARKERS = [
  "why",
  "explain",
  "compare",
  "design",
  "analyse",
  "analyze",
  "evaluate",
  "critique",
  "architect",
  "tradeoff",
  "trade-off",
  "pros and cons",
  "step by step",
];

const CODE_MARKERS = [
  "implement",
  "write a function",
  "refactor",
  "debug",
  "fix the bug",
  "unit test",
  "integration test",
  "code review",
];

const RESEARCH_MARKERS = [
  "research",
  "summarize",
  "summarise",
  "overview",
  "survey",
  "what is",
  "how does",
  "find information",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Rough token estimate: ~4 chars per token. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function containsAny(text: string, markers: string[]): boolean {
  const lower = text.toLowerCase();
  return markers.some((m) => lower.includes(m));
}

function inferTaskType(message: string): TaskType {
  const lower = message.toLowerCase();
  if (containsAny(lower, REASONING_MARKERS)) {
    return "reasoning";
  }
  if (containsAny(lower, CODE_MARKERS) || lower.includes("```")) {
    return "code";
  }
  if (containsAny(lower, RESEARCH_MARKERS)) {
    return "research";
  }
  return "chat";
}

function tierFromScore(score: number): ModelTier {
  if (score < 0.2) return "nano";
  if (score < 0.5) return "micro";
  if (score < 0.85) return "base";
  return "expert";
}

// ── Main scorer ───────────────────────────────────────────────────────────────

/**
 * Score the complexity of a single conversation turn.
 *
 * All inputs are optional — a bare message string is sufficient.
 * The function is stateless and deterministic.
 *
 * Scoring design: task type provides the base score, modifiers push high-signal
 * inputs toward Expert. Maximum theoretical score is 1.10 (clamped to 1.0).
 *
 *   Base scores: chat=0.05, research=0.25, code=0.50, reasoning=0.70
 *   Modifiers:   length +0–0.15, tool calls +0–0.10, code blocks +0.05, markers +0.10
 */
export function scoreComplexity(input: ComplexityInput): ComplexityResult {
  const { message, recentToolCalls = 0, hasCodeBlocks = false } = input;

  // Component 1: task type base score
  const taskType = input.taskType ?? inferTaskType(message);
  const BASE_SCORES: Record<TaskType, number> = {
    chat: 0.05,
    research: 0.25,
    code: 0.50,
    reasoning: 0.70,
  };
  const baseScore = BASE_SCORES[taskType] ?? 0.05;

  // Component 2: message length modifier (+0–0.15 over TOKEN_SATURATION tokens)
  const tokens = estimateTokens(message);
  const lengthMod = clamp01(tokens / TOKEN_SATURATION) * 0.15;

  // Component 3: tool call history modifier (+0–0.10 for up to 5 recent calls)
  const toolMod = clamp01(recentToolCalls / 5) * 0.10;

  // Component 4: code block presence modifier
  const codeBlockMod = hasCodeBlocks ? 0.05 : 0;

  // Component 5: reasoning or code marker modifier
  const hasReasoning = containsAny(message, REASONING_MARKERS);
  const hasCode = containsAny(message, CODE_MARKERS) || message.includes("```");
  const markerMod = hasReasoning ? 0.10 : hasCode ? 0.05 : 0;

  const score = clamp01(baseScore + lengthMod + toolMod + codeBlockMod + markerMod);

  return {
    score,
    tier: tierFromScore(score),
    taskType,
  };
}
