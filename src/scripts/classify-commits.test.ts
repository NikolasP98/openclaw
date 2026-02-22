import { describe, expect, it } from "vitest";
import { classifyCommit, classifyCommits } from "../../scripts/classify-commits.js";

describe("classifyCommit", () => {
  it("classifies security fixes as critical", () => {
    expect(classifyCommit("abc123", "fix: security vulnerability in auth").category).toBe(
      "critical",
    );
    expect(classifyCommit("abc123", "fix: CVE-2025-1234 patch").category).toBe("critical");
  });

  it("classifies breaking changes as critical", () => {
    expect(classifyCommit("abc123", "feat!: remove deprecated API").category).toBe("critical");
    expect(classifyCommit("abc123", "BREAKING CHANGE: new config format").category).toBe(
      "critical",
    );
  });

  it("classifies docs-only as irrelevant", () => {
    expect(classifyCommit("abc123", "docs: update README").category).toBe("irrelevant");
    expect(classifyCommit("abc123", "docs(api): fix typo").category).toBe("irrelevant");
  });

  it("classifies CI changes as irrelevant", () => {
    expect(classifyCommit("abc123", "ci: update node version").category).toBe("irrelevant");
    expect(classifyCommit("abc123", "ci(release): fix publish").category).toBe("irrelevant");
  });

  it("classifies dep bumps as irrelevant", () => {
    expect(classifyCommit("abc123", "chore(deps): bump lodash to 4.17.21").category).toBe(
      "irrelevant",
    );
  });

  it("classifies conflict-risk by file paths", () => {
    const result = classifyCommit("abc123", "feat: add new routing mode", [
      "src/auto-reply/reply/route.ts",
    ]);
    expect(result.category).toBe("conflict-risk");
  });

  it("defaults to relevant for normal features", () => {
    expect(classifyCommit("abc123", "feat: add new tool").category).toBe("relevant");
    expect(classifyCommit("abc123", "fix: handle edge case in parser").category).toBe("relevant");
  });

  it("critical takes precedence over conflict-risk", () => {
    const result = classifyCommit("abc123", "fix: security issue in config", [
      "src/config/loader.ts",
    ]);
    expect(result.category).toBe("critical");
  });
});

describe("classifyCommits", () => {
  it("classifies multiple commit lines", () => {
    const results = classifyCommits([
      "abc1234 fix: security patch",
      "def5678 docs: update guide",
      "ghi9012 feat: add widget",
    ]);
    expect(results).toHaveLength(3);
    expect(results[0].category).toBe("critical");
    expect(results[1].category).toBe("irrelevant");
    expect(results[2].category).toBe("relevant");
  });

  it("skips empty lines", () => {
    const results = classifyCommits(["abc1234 fix: bug", "", "  "]);
    expect(results).toHaveLength(1);
  });

  it("handles lines with no space (SHA only)", () => {
    const results = classifyCommits(["abc1234"]);
    expect(results).toHaveLength(1);
    expect(results[0].sha).toBe("abc1234");
  });
});
