import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const workflowPath = resolve(repoRoot, ".github/workflows/npm-publish.yml");
const workflow = parse(readFileSync(workflowPath, "utf8"));

/** Find a step by its `name` field (resilient to reordering). */
function stepByName(steps: Array<Record<string, unknown>>, name: string) {
  return steps.find((s) => typeof s.name === "string" && s.name.includes(name));
}

const job = workflow.jobs?.publish;
const steps: Array<Record<string, unknown>> = job?.steps ?? [];

describe("npm-publish.yml", () => {
  // ── Triggers ──────────────────────────────────────────────────────
  describe("triggers", () => {
    it("triggers on push to main and DEV only", () => {
      const branches = workflow.on?.push?.branches;
      expect(branches).toEqual(expect.arrayContaining(["main", "DEV"]));
      expect(branches).toHaveLength(2);
    });

    it("does not trigger on pull_request", () => {
      expect(workflow.on?.pull_request).toBeUndefined();
    });
  });

  // ── Concurrency ──────────────────────────────────────────────────
  describe("concurrency", () => {
    it("uses shared group 'npm-publish'", () => {
      expect(workflow.concurrency?.group).toBe("npm-publish");
    });

    it("does not cancel in-progress runs", () => {
      expect(workflow.concurrency?.["cancel-in-progress"]).toBe(false);
    });
  });

  // ── Job structure ────────────────────────────────────────────────
  describe("job structure", () => {
    it("has a single 'publish' job", () => {
      expect(Object.keys(workflow.jobs)).toEqual(["publish"]);
    });

    it("runs on ubuntu-latest", () => {
      expect(job?.["runs-on"]).toBe("ubuntu-latest");
    });

    it("requests contents: read permission", () => {
      expect(job?.permissions?.contents).toBe("read");
    });
  });

  // ── Steps ────────────────────────────────────────────────────────
  describe("steps", () => {
    it("checks out code first", () => {
      expect(steps[0]?.uses).toMatch(/^actions\/checkout@/);
    });

    it("sets up node-env with 22.x", () => {
      const setup = steps.find(
        (s) => typeof s.uses === "string" && s.uses.includes("setup-node-env"),
      );
      expect(setup).toBeDefined();
      expect(setup?.with).toMatchObject({ "node-version": "22.x" });
    });

    it("configures npm auth using NPM_TOKEN", () => {
      const auth = stepByName(steps, "npm auth");
      expect(auth).toBeDefined();
      expect(auth?.run).toContain("NPM_TOKEN");
    });
  });

  // ── Branch conditions ────────────────────────────────────────────
  describe("branch conditions", () => {
    it("version-check runs only on main", () => {
      const versionCheck = stepByName(steps, "version already published");
      expect(versionCheck).toBeDefined();
      expect(versionCheck?.if).toContain("main");
      expect(String(versionCheck?.if)).not.toContain("DEV");
    });

    it("prerelease version runs only on DEV", () => {
      const prerelease = stepByName(steps, "prerelease version");
      expect(prerelease).toBeDefined();
      expect(prerelease?.if).toContain("DEV");
      expect(String(prerelease?.if)).not.toContain("main");
    });
  });

  // ── Publish tags ─────────────────────────────────────────────────
  describe("publish tags", () => {
    it("main publishes with --tag latest", () => {
      const pub = stepByName(steps, "Publish (main");
      expect(pub).toBeDefined();
      expect(pub?.run).toContain("--tag latest");
    });

    it("DEV publishes with --tag dev", () => {
      const pub = stepByName(steps, "Publish (DEV");
      expect(pub).toBeDefined();
      expect(pub?.run).toContain("--tag dev");
    });
  });

  // ── Package scope ────────────────────────────────────────────────
  describe("package scope", () => {
    const raw = readFileSync(workflowPath, "utf8");

    it("references @nikolasp98/minion", () => {
      expect(raw).toContain("@nikolasp98/minion");
    });

    it("never references @anthropic/minion", () => {
      expect(raw).not.toContain("@anthropic/minion");
    });
  });

  // ── Publish command ──────────────────────────────────────────────
  describe("publish command", () => {
    it("uses pnpm publish --no-git-checks", () => {
      const allRuns = steps.map((s) => s.run).filter(Boolean);
      const publishSteps = allRuns.filter((r) => String(r).includes("pnpm publish"));
      expect(publishSteps.length).toBeGreaterThanOrEqual(1);
      for (const cmd of publishSteps) {
        expect(cmd).toContain("--no-git-checks");
      }
    });
  });
});
