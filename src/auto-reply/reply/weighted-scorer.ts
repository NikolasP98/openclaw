/**
 * Weighted 15-dimension routing scorer with REASONING tier.
 *
 * Replaces the first-match-wins heuristic with an accumulating weighted
 * score across 15 signal dimensions. Each dimension contributes a score
 * (0-1) multiplied by its weight. The final tier is determined by
 * threshold boundaries.
 *
 * Includes a 4th REASONING tier for chain-of-thought, mathematical
 * proofs, and step-by-step reasoning tasks.
 *
 * Inspired by ClawRouter's 15-dimension scorer and LocalClaw's tier system.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────

export type ExtendedComplexity = "simple" | "moderate" | "complex" | "reasoning";

export interface DimensionScore {
  name: string;
  score: number; // 0-1
  weight: number;
  weighted: number; // score * weight
}

export interface ScorerResult {
  tier: ExtendedComplexity;
  totalScore: number;
  dimensions: DimensionScore[];
}

export interface ScorerConfig {
  /** Threshold below which → simple (default: 0.2). */
  simpleThreshold?: number;
  /** Threshold above which → complex (default: 0.6). */
  complexThreshold?: number;
  /** Threshold above which → reasoning (default: 0.85). */
  reasoningThreshold?: number;
  /** Per-dimension weight overrides (keyed by dimension name). */
  weights?: Record<string, number>;
}

// ── Default weights ──────────────────────────────────────────────────

const DEFAULT_WEIGHTS: Record<string, number> = {
  codeBlockPresence: 1.0,
  lineCount: 0.6,
  verbComplexity: 0.8,
  questionType: 0.4,
  toolMentions: 0.7,
  urlPresence: 0.5,
  filePathPresence: 0.6,
  technicalKeywords: 0.9,
  sentenceCount: 0.5,
  messageLength: 0.3,
  slashCommand: 0.8,
  acknowledgement: -0.8, // Negative = pushes toward simple
  reasoning: 1.2, // Boosted for REASONING tier
  structuredData: 0.7,
  emotionOnly: -0.6,
};

const DEFAULT_SIMPLE_THRESHOLD = 0.05;
const DEFAULT_COMPLEX_THRESHOLD = 0.15;
const DEFAULT_REASONING_THRESHOLD = 0.35;

// ── Dimension scorers ────────────────────────────────────────────────

type DimensionFn = (message: string, words: string[]) => number;

const dimensions: Array<{ name: string; fn: DimensionFn }> = [
  {
    name: "codeBlockPresence",
    fn: (msg) => /```[\s\S]*?```|^    \S/m.test(msg) ? 1 : 0,
  },
  {
    name: "lineCount",
    fn: (msg) => {
      const lines = msg.split("\n").length;
      if (lines >= 10) return 1;
      if (lines >= 5) return 0.6;
      if (lines >= 3) return 0.3;
      return 0;
    },
  },
  {
    name: "verbComplexity",
    fn: (_msg, words) => {
      const complex = new Set(["refactor", "implement", "architect", "debug", "optimize", "deploy", "migrate", "integrate", "diagnose", "provision", "orchestrate"]);
      const count = words.filter((w) => complex.has(w)).length;
      return Math.min(count / 2, 1);
    },
  },
  {
    name: "questionType",
    fn: (msg) => {
      if (/\b(how|why|explain|what happens when|walk me through)\b/i.test(msg)) return 0.5;
      if (/\?/.test(msg)) return 0.2;
      return 0;
    },
  },
  {
    name: "toolMentions",
    fn: (msg) => {
      const tools = /\b(grep|curl|docker|git|npm|pip|kubectl|terraform|ansible|ssh)\b/i;
      return tools.test(msg) ? 0.7 : 0;
    },
  },
  {
    name: "urlPresence",
    fn: (msg) => /https?:\/\/\S+/.test(msg) ? 0.6 : 0,
  },
  {
    name: "filePathPresence",
    fn: (msg) => /(?:\/[\w.-]+){2,}|[A-Z]:\\[\w\\.-]+/.test(msg) ? 0.5 : 0,
  },
  {
    name: "technicalKeywords",
    fn: (_msg, words) => {
      const tech = new Set(["api", "database", "schema", "endpoint", "middleware", "component", "module", "typescript", "python", "function", "class", "interface", "algorithm", "pipeline", "container"]);
      const count = words.filter((w) => tech.has(w)).length;
      return Math.min(count / 3, 1);
    },
  },
  {
    name: "sentenceCount",
    fn: (msg) => {
      const sentences = msg.split(/[.!?]+\s/).filter(Boolean).length;
      if (sentences >= 5) return 0.8;
      if (sentences >= 3) return 0.4;
      return 0;
    },
  },
  {
    name: "messageLength",
    fn: (msg) => {
      const len = msg.trim().length;
      if (len > 500) return 0.8;
      if (len > 200) return 0.4;
      if (len > 50) return 0.1;
      return 0;
    },
  },
  {
    name: "slashCommand",
    fn: (msg) => /^\/\w+/.test(msg.trim()) ? 1 : 0,
  },
  {
    name: "acknowledgement",
    fn: (msg) => {
      const ack = /^(?:yes|yeah|yep|no|nah|ok|okay|sure|thanks|thank\s+you|cool|nice|great|good|awesome|lol|haha|👍|❤️|🙏)\s*[.!?]?\s*$/i;
      return ack.test(msg.trim()) ? 1 : 0;
    },
  },
  {
    name: "reasoning",
    fn: (msg) => {
      let score = 0;
      if (/\b(step[- ]by[- ]step|chain[- ]of[- ]thought|reason through|think through|prove|proof|derive|derivation)\b/i.test(msg)) score += 0.5;
      if (/\b(mathematical|theorem|lemma|induction|contradiction|formal)\b/i.test(msg)) score += 0.3;
      if (/<think>|<reasoning>|\bCoT\b/i.test(msg)) score += 0.4;
      if (/\b(o1|o3|deepseek-r1|reasoning model)\b/i.test(msg)) score += 0.3;
      if (/\b(analyze|compare and contrast|evaluate the tradeoffs|pros and cons)\b/i.test(msg)) score += 0.2;
      return Math.min(score, 1);
    },
  },
  {
    name: "structuredData",
    fn: (msg) => {
      if (/\{[\s\S]*"[\w]+"\s*:/.test(msg)) return 0.6; // JSON
      if (/\|.*\|.*\|/.test(msg)) return 0.4; // Markdown table
      if (/^[-*]\s/m.test(msg)) return 0.2; // Lists
      return 0;
    },
  },
  {
    name: "emotionOnly",
    fn: (msg) => {
      const trimmed = msg.trim();
      if (/^[\p{Emoji}\s]+$/u.test(trimmed)) return 1; // Only emoji
      if (trimmed.length < 10 && /^[!?.]+$/.test(trimmed)) return 0.8; // Only punctuation
      return 0;
    },
  },
];

// ── Scorer ───────────────────────────────────────────────────────────

/**
 * Score a message across all 15 dimensions and determine its tier.
 */
export function scoreMessage(message: string, config?: ScorerConfig): ScorerResult {
  const trimmed = message.trim();
  if (!trimmed) {
    return { tier: "simple", totalScore: 0, dimensions: [] };
  }

  const words = trimmed.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9-]/g, "")).filter(Boolean);
  const weightOverrides = config?.weights ?? {};

  const scored: DimensionScore[] = dimensions.map((dim) => {
    const rawScore = dim.fn(trimmed, words);
    const weight = weightOverrides[dim.name] ?? DEFAULT_WEIGHTS[dim.name] ?? 0.5;
    return {
      name: dim.name,
      score: rawScore,
      weight,
      weighted: rawScore * weight,
    };
  });

  // Sum positive and negative contributions separately for normalization.
  const positiveSum = scored.filter((s) => s.weighted > 0).reduce((a, b) => a + b.weighted, 0);
  const negativeSum = scored.filter((s) => s.weighted < 0).reduce((a, b) => a + b.weighted, 0);
  const maxPossiblePositive = scored.filter((s) => s.weight > 0).reduce((a, b) => a + Math.abs(b.weight), 0);

  // Normalize to 0-1 range.
  const totalScore = maxPossiblePositive > 0
    ? Math.max(0, Math.min(1, (positiveSum + negativeSum) / maxPossiblePositive))
    : 0;

  // Determine tier.
  const simpleThreshold = config?.simpleThreshold ?? DEFAULT_SIMPLE_THRESHOLD;
  const complexThreshold = config?.complexThreshold ?? DEFAULT_COMPLEX_THRESHOLD;
  const reasoningThreshold = config?.reasoningThreshold ?? DEFAULT_REASONING_THRESHOLD;

  let tier: ExtendedComplexity;
  if (totalScore >= reasoningThreshold) {
    tier = "reasoning";
  } else if (totalScore >= complexThreshold) {
    tier = "complex";
  } else if (totalScore > simpleThreshold) {
    tier = "moderate";
  } else {
    tier = "simple";
  }

  return { tier, totalScore, dimensions: scored };
}
