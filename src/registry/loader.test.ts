import { describe, expect, it } from "vitest";
import { loadRegistry } from "./loader.js";
import type { LoaderDeps } from "./loader.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_MANIFEST = {
  id: "knowledge-graph",
  name: "Knowledge Graph",
  description: "Persistent entity graph — remember, recall, and link facts",
  version: "1.0.0",
  tools: ["remember", "recall_entity"],
  requires: [],
  handler: "../../memory/knowledge-graph.js",
  testCoverage: 100,
};

function makeDeps(overrides: Partial<LoaderDeps> = {}): LoaderDeps {
  return {
    readManifests: () => [{ raw: VALID_MANIFEST, source: "test/knowledge-graph.manifest.json" }],
    env: {},
    ...overrides,
  };
}

// ── happy path ────────────────────────────────────────────────────────────────

describe("loadRegistry — happy path", () => {
  it("loads a valid manifest", () => {
    const { skills, diagnostics } = loadRegistry(makeDeps());
    expect(skills).toHaveLength(1);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
  });

  it("returns manifest data intact", () => {
    const { skills } = loadRegistry(makeDeps());
    expect(skills[0]!.manifest.id).toBe("knowledge-graph");
    expect(skills[0]!.manifest.tools).toContain("remember");
  });

  it("loads multiple valid manifests", () => {
    const deps = makeDeps({
      readManifests: () => [
        { raw: VALID_MANIFEST, source: "a.manifest.json" },
        {
          raw: { ...VALID_MANIFEST, id: "web-search", name: "Web Search" },
          source: "b.manifest.json",
        },
      ],
    });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(2);
  });

  it("populates source field on each entry", () => {
    const { skills } = loadRegistry(makeDeps());
    expect(skills[0]!.source).toBe("test/knowledge-graph.manifest.json");
  });

  it("applies schema defaults (empty tools and requires)", () => {
    const minimal = { ...VALID_MANIFEST, tools: undefined, requires: undefined };
    const deps = makeDeps({ readManifests: () => [{ raw: minimal, source: "test" }] });
    const { skills } = loadRegistry(deps);
    expect(skills[0]!.manifest.tools).toEqual([]);
    expect(skills[0]!.manifest.requires).toEqual([]);
  });
});

// ── schema validation ─────────────────────────────────────────────────────────

describe("loadRegistry — schema validation", () => {
  it("skips manifest with missing id", () => {
    const { id: _id, ...noId } = VALID_MANIFEST;
    const deps = makeDeps({ readManifests: () => [{ raw: noId, source: "test" }] });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(0);
    expect(diagnostics.some((d) => d.level === "error")).toBe(true);
  });

  it("skips manifest with missing handler", () => {
    const { handler: _h, ...noHandler } = VALID_MANIFEST;
    const deps = makeDeps({ readManifests: () => [{ raw: noHandler, source: "test" }] });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(0);
    expect(diagnostics.some((d) => d.level === "error" && d.message.includes("handler"))).toBe(true);
  });

  it("skips manifest with invalid version format", () => {
    const bad = { ...VALID_MANIFEST, version: "not-semver" };
    const deps = makeDeps({ readManifests: () => [{ raw: bad, source: "test" }] });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(0);
    expect(diagnostics.some((d) => d.message.includes("semver"))).toBe(true);
  });

  it("loads valid manifests even when some are invalid", () => {
    const deps = makeDeps({
      readManifests: () => [
        { raw: VALID_MANIFEST, source: "good.manifest.json" },
        { raw: { invalid: true }, source: "bad.manifest.json" },
      ],
    });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
    expect(diagnostics.some((d) => d.level === "error")).toBe(true);
  });
});

// ── env var requirements ──────────────────────────────────────────────────────

describe("loadRegistry — env var requirements", () => {
  it("includes skill when all required env vars are set", () => {
    const manifest = { ...VALID_MANIFEST, requires: ["OPENAI_API_KEY"] };
    const deps = makeDeps({
      readManifests: () => [{ raw: manifest, source: "test" }],
      env: { OPENAI_API_KEY: "sk-test-key" },
    });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
  });

  it("excludes skill when a required env var is missing", () => {
    const manifest = { ...VALID_MANIFEST, requires: ["OPENAI_API_KEY"] };
    const deps = makeDeps({
      readManifests: () => [{ raw: manifest, source: "test" }],
      env: {}, // no OPENAI_API_KEY
    });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(0);
    expect(diagnostics.some((d) => d.level === "warn" && d.message.includes("OPENAI_API_KEY"))).toBe(true);
  });

  it("excludes skill with multiple missing env vars, listing all in warning", () => {
    const manifest = { ...VALID_MANIFEST, requires: ["KEY_A", "KEY_B"] };
    const deps = makeDeps({
      readManifests: () => [{ raw: manifest, source: "test" }],
      env: { KEY_A: "set" }, // KEY_B missing
    });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(0);
    expect(diagnostics.some((d) => d.message.includes("KEY_B"))).toBe(true);
  });

  it("includes skill with no requirements in empty env", () => {
    const deps = makeDeps({ env: {} });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
  });
});

// ── test coverage gate ────────────────────────────────────────────────────────

describe("loadRegistry — test coverage gate", () => {
  it("includes skill when coverage meets the minimum", () => {
    const manifest = { ...VALID_MANIFEST, testCoverage: 80 };
    const deps = makeDeps({
      readManifests: () => [{ raw: manifest, source: "test" }],
      minTestCoverage: 80,
    });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
  });

  it("excludes skill when coverage is below minimum", () => {
    const manifest = { ...VALID_MANIFEST, testCoverage: 60 };
    const deps = makeDeps({
      readManifests: () => [{ raw: manifest, source: "test" }],
      minTestCoverage: 80,
    });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(0);
    expect(diagnostics.some((d) => d.level === "warn" && d.message.includes("coverage"))).toBe(true);
  });

  it("excludes skill with undefined coverage when gate is active", () => {
    const { testCoverage: _tc, ...noTC } = VALID_MANIFEST;
    const deps = makeDeps({
      readManifests: () => [{ raw: noTC, source: "test" }],
      minTestCoverage: 50,
    });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(0);
  });

  it("ignores coverage gate when minTestCoverage=0 (default)", () => {
    const manifest = { ...VALID_MANIFEST, testCoverage: 0 };
    const deps = makeDeps({
      readManifests: () => [{ raw: manifest, source: "test" }],
      minTestCoverage: 0,
    });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
  });
});

// ── error resilience ──────────────────────────────────────────────────────────

describe("loadRegistry — error resilience", () => {
  it("returns empty registry + error diagnostic when readManifests throws", () => {
    const deps = makeDeps({
      readManifests: () => { throw new Error("disk error"); },
    });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(0);
    expect(diagnostics.some((d) => d.level === "error" && d.message.includes("disk error"))).toBe(true);
  });

  it("does not crash on completely invalid raw input", () => {
    const deps = makeDeps({
      readManifests: () => [
        { raw: null, source: "null.manifest.json" },
        { raw: undefined, source: "undef.manifest.json" },
        { raw: "plain string", source: "str.manifest.json" },
        { raw: 42, source: "num.manifest.json" },
      ],
    });
    expect(() => loadRegistry(deps)).not.toThrow();
  });

  it("processes subsequent manifests after encountering an invalid one", () => {
    const deps = makeDeps({
      readManifests: () => [
        { raw: null, source: "bad.manifest.json" },
        { raw: VALID_MANIFEST, source: "good.manifest.json" },
      ],
    });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
  });
});

// ── sample manifests from manifests/ directory ────────────────────────────────

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

describe("sample manifests from manifests/", () => {
  it("knowledge-graph manifest parses and validates", () => {
    const raw = require("./manifests/knowledge-graph.manifest.json") as unknown;
    const deps = makeDeps({ readManifests: () => [{ raw, source: "knowledge-graph.manifest.json" }] });
    const { skills, diagnostics } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
    expect(diagnostics.filter((d) => d.level === "error")).toHaveLength(0);
    expect(skills[0]!.manifest.id).toBe("knowledge-graph");
  });

  it("web-search manifest parses and validates", () => {
    const raw = require("./manifests/web-search.manifest.json") as unknown;
    const deps = makeDeps({ readManifests: () => [{ raw, source: "web-search.manifest.json" }] });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
  });

  it("browser-control manifest parses and validates", () => {
    const raw = require("./manifests/browser-control.manifest.json") as unknown;
    const deps = makeDeps({ readManifests: () => [{ raw, source: "browser-control.manifest.json" }] });
    const { skills } = loadRegistry(deps);
    expect(skills).toHaveLength(1);
  });
});
