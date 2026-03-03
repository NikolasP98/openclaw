/**
 * Anthropic prompt caching — split system prompt into cacheable content blocks.
 *
 * Adds `cache_control: { type: "ephemeral" }` to static sections of the
 * system prompt (identity, tool descriptions) that don't change between turns.
 * This reduces cost by 60-90% on those tokens.
 *
 * Only applies to Anthropic provider. Other providers receive the prompt as-is.
 *
 * Nanobot v0.1.4 adopted this specifically for cost reduction.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface CacheableContentBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

// ── Section markers (used to split the system prompt) ────────────────

/** Sections that are stable across turns → cacheable. */
const CACHEABLE_SECTION_HEADERS = [
  "## Tooling",
  "## Skills (mandatory)",
  "## Personality",
  "## Core Principles",
];

/** Sections that change per turn → NOT cacheable. */
const DYNAMIC_SECTION_HEADERS = [
  "## Memory Recall",
  "## Memory Management",
  "## Memory (group context)",
  "## Runtime",
  "## Conversation",
];

// ── Implementation ───────────────────────────────────────────────────

/**
 * Check if Anthropic prompt caching should be applied.
 */
export function shouldApplyPromptCache(provider: string | undefined): boolean {
  if (!provider) return false;
  const lower = provider.toLowerCase();
  return lower === "anthropic" || lower.includes("anthropic") || lower.includes("claude");
}

/**
 * Split a system prompt into Anthropic content blocks with cache_control
 * on static sections.
 *
 * The prompt is split at `## Section` boundaries. Sections listed in
 * CACHEABLE_SECTION_HEADERS get `cache_control: { type: "ephemeral" }`.
 *
 * Returns a single block (no caching) if:
 * - The prompt is too short (<1024 chars — Anthropic minimum for caching)
 * - No section boundaries are found
 */
export function buildCacheableSystemPrompt(
  systemPrompt: string,
): CacheableContentBlock[] {
  // Anthropic requires minimum 1024 tokens (~4096 chars) for caching to be worthwhile.
  if (systemPrompt.length < 1024) {
    return [{ type: "text", text: systemPrompt }];
  }

  const sections = splitAtSections(systemPrompt);
  if (sections.length <= 1) {
    return [{ type: "text", text: systemPrompt }];
  }

  // Group consecutive cacheable sections into a single block for efficiency.
  const blocks: CacheableContentBlock[] = [];
  let currentCacheable = "";
  let currentDynamic = "";

  for (const section of sections) {
    const isCacheable = isCacheableSection(section.header);
    if (isCacheable) {
      // Flush any pending dynamic content.
      if (currentDynamic) {
        blocks.push({ type: "text", text: currentDynamic.trim() });
        currentDynamic = "";
      }
      currentCacheable += section.content;
    } else {
      // Flush any pending cacheable content.
      if (currentCacheable) {
        blocks.push({
          type: "text",
          text: currentCacheable.trim(),
          cache_control: { type: "ephemeral" },
        });
        currentCacheable = "";
      }
      currentDynamic += section.content;
    }
  }

  // Flush remaining.
  if (currentCacheable) {
    blocks.push({
      type: "text",
      text: currentCacheable.trim(),
      cache_control: { type: "ephemeral" },
    });
  }
  if (currentDynamic) {
    blocks.push({ type: "text", text: currentDynamic.trim() });
  }

  return blocks.filter((b) => b.text.length > 0);
}

// ── Helpers ──────────────────────────────────────────────────────────

interface PromptSection {
  header: string;
  content: string;
}

function splitAtSections(prompt: string): PromptSection[] {
  const lines = prompt.split("\n");
  const sections: PromptSection[] = [];
  let currentHeader = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      // Flush previous section.
      if (currentLines.length > 0 || currentHeader) {
        sections.push({ header: currentHeader, content: currentLines.join("\n") + "\n" });
      }
      currentHeader = line.trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  // Flush final section.
  if (currentLines.length > 0) {
    sections.push({ header: currentHeader, content: currentLines.join("\n") });
  }

  return sections;
}

function isCacheableSection(header: string): boolean {
  if (!header) return true; // Preamble before first section = identity/base = cacheable.
  return CACHEABLE_SECTION_HEADERS.some((h) => header.startsWith(h));
}
