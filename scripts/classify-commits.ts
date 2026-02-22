/**
 * Classify upstream commits — determine relevance for fork integration.
 *
 * Reads commit messages from stdin (one per line, format: "SHA subject")
 * and classifies them into categories:
 * - "critical": security fixes, breaking changes — must integrate
 * - "relevant": feature additions, bug fixes in areas we use
 * - "irrelevant": docs-only, CI changes, unrelated features
 * - "conflict-risk": touches files we've heavily modified
 *
 * Used by the upstream-monitor workflow to prioritize cherry-picks.
 *
 * Usage: git log --oneline upstream/main..HEAD | npx tsx scripts/classify-commits.ts
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CommitCategory = "critical" | "relevant" | "irrelevant" | "conflict-risk";

export type ClassifiedCommit = {
  sha: string;
  subject: string;
  category: CommitCategory;
  reason: string;
};

// ── Classification Rules ─────────────────────────────────────────────────────

const CRITICAL_PATTERNS = [
  /\bsecurit(y|ies)\b/i,
  /\bCVE-\d+/i,
  /\bvulnerabilit(y|ies)\b/i,
  /\bBREAKING\s+CHANGE\b/i,
  /\bfix!:/i,
  /\bfeat!:/i,
];

const IRRELEVANT_PATTERNS = [
  /^docs(\(.+\))?:/i,
  /^ci(\(.+\))?:/i,
  /^chore\(deps\):/i,
  /^style(\(.+\))?:/i,
  /\bREADME\b/i,
  /\bCHANGELOG\b/i,
  /\btypecheck\b/i,
  /\blint\s*fix/i,
];

const CONFLICT_RISK_PATHS = [
  "src/auto-reply/",
  "src/agents/model-fallback",
  "src/agents/workspace",
  "src/config/",
  "src/providers/registry",
  "src/sessions/",
];

/**
 * Classify a single commit by its subject line.
 *
 * Uses pattern matching on the conventional commit message. For more
 * accurate classification of conflict risk, pass file paths from
 * `git diff-tree --no-commit-id --name-only`.
 */
export function classifyCommit(
  sha: string,
  subject: string,
  changedFiles?: string[],
): ClassifiedCommit {
  // Critical patterns first (highest priority)
  for (const pattern of CRITICAL_PATTERNS) {
    if (pattern.test(subject)) {
      return { sha, subject, category: "critical", reason: `Matches critical pattern: ${pattern}` };
    }
  }

  // Check conflict risk by file paths
  if (changedFiles) {
    for (const file of changedFiles) {
      for (const riskPath of CONFLICT_RISK_PATHS) {
        if (file.startsWith(riskPath)) {
          return {
            sha,
            subject,
            category: "conflict-risk",
            reason: `Touches fork-modified path: ${riskPath}`,
          };
        }
      }
    }
  }

  // Irrelevant patterns
  for (const pattern of IRRELEVANT_PATTERNS) {
    if (pattern.test(subject)) {
      return {
        sha,
        subject,
        category: "irrelevant",
        reason: `Matches irrelevant pattern: ${pattern}`,
      };
    }
  }

  // Default: relevant (features, fixes, etc.)
  return { sha, subject, category: "relevant", reason: "Default classification" };
}

/**
 * Classify multiple commits from a list of "SHA subject" lines.
 */
export function classifyCommits(lines: string[]): ClassifiedCommit[] {
  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const spaceIdx = line.indexOf(" ");
      if (spaceIdx === -1) {
        return classifyCommit(line, "");
      }
      return classifyCommit(line.slice(0, spaceIdx), line.slice(spaceIdx + 1));
    });
}

// ── CLI Entry ────────────────────────────────────────────────────────────────

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const input = Buffer.concat(chunks).toString("utf-8");
  const lines = input.split("\n");
  const results = classifyCommits(lines);

  // Group by category for readable output
  const grouped = new Map<CommitCategory, ClassifiedCommit[]>();
  for (const r of results) {
    const list = grouped.get(r.category) ?? [];
    list.push(r);
    grouped.set(r.category, list);
  }

  for (const [category, commits] of grouped) {
    console.log(`\n## ${category.toUpperCase()} (${commits.length})`);
    for (const c of commits) {
      console.log(`  ${c.sha} ${c.subject}`);
    }
  }

  // Exit with code 1 if any critical commits found
  if (grouped.has("critical")) {
    process.exit(1);
  }
}

// Only run CLI when executed directly (not imported)
if (process.argv[1]?.endsWith("classify-commits.ts")) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
