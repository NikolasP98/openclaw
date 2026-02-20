import { describe, expect, it } from "vitest";
import {
  findByApiBase,
  findByModel,
  findByName,
  getAllProviders,
  getLocalProviders,
  supportsToolCalling,
  supportsVision,
} from "./registry.js";

describe("findByName", () => {
  it("finds anthropic", () => {
    expect(findByName("anthropic")?.name).toBe("anthropic");
  });

  it("finds ollama", () => {
    expect(findByName("ollama")?.isLocal).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(findByName("Anthropic")?.name).toBe("anthropic");
    expect(findByName("OPENAI")?.name).toBe("openai");
  });

  it("returns undefined for unknown provider", () => {
    expect(findByName("unknown")).toBeUndefined();
  });
});

describe("findByModel", () => {
  const cases = [
    ["claude-sonnet-4", "anthropic"],
    ["claude-haiku-3.5", "anthropic"],
    ["gpt-4o", "openai"],
    ["o1-preview", "openai"],
    ["o3-mini", "openai"],
    ["gemini-2.0-flash", "google"],
    ["mistral-large", "mistral"],
    ["deepseek-chat", "deepseek"],
    ["grok-2", "xai"],
    ["qwen3:1.7b", "ollama"],
    ["llama3-8b", "ollama"],
    ["mixtral-8x7b", "groq"],
    ["gemma3:12b", "ollama"],
  ] as const;

  for (const [modelId, expectedProvider] of cases) {
    it(`resolves "${modelId}" to "${expectedProvider}"`, () => {
      expect(findByModel(modelId)?.name).toBe(expectedProvider);
    });
  }

  it("returns undefined for completely unknown model", () => {
    expect(findByModel("totally-unknown-model-xyz")).toBeUndefined();
  });
});

describe("findByApiBase", () => {
  it("finds anthropic by API base", () => {
    expect(findByApiBase("https://api.anthropic.com")?.name).toBe("anthropic");
  });

  it("handles trailing slashes", () => {
    expect(findByApiBase("https://api.anthropic.com/")?.name).toBe("anthropic");
  });

  it("is case-insensitive", () => {
    expect(findByApiBase("HTTPS://API.ANTHROPIC.COM")?.name).toBe("anthropic");
  });

  it("finds ollama by local base", () => {
    expect(findByApiBase("http://127.0.0.1:11434")?.name).toBe("ollama");
  });

  it("returns undefined for unknown base", () => {
    expect(findByApiBase("https://unknown.api.com")).toBeUndefined();
  });
});

describe("getAllProviders", () => {
  it("returns a non-empty array", () => {
    const all = getAllProviders();
    expect(all.length).toBeGreaterThan(10);
  });

  it("includes both local and cloud providers", () => {
    const all = getAllProviders();
    expect(all.some((p) => p.isLocal)).toBe(true);
    expect(all.some((p) => !p.isLocal)).toBe(true);
  });
});

describe("getLocalProviders", () => {
  it("returns only local providers", () => {
    const locals = getLocalProviders();
    expect(locals.every((p) => p.isLocal)).toBe(true);
    expect(locals.length).toBeGreaterThan(0);
    const names = locals.map((p) => p.name);
    expect(names).toContain("ollama");
    expect(names).toContain("lmstudio");
    expect(names).toContain("vllm");
  });
});

describe("supportsToolCalling", () => {
  it("returns true for anthropic", () => {
    expect(supportsToolCalling("anthropic")).toBe(true);
  });

  it("defaults to true for unknown providers", () => {
    expect(supportsToolCalling("unknown-provider")).toBe(true);
  });
});

describe("supportsVision", () => {
  it("returns true for anthropic", () => {
    expect(supportsVision("anthropic")).toBe(true);
  });

  it("returns false for groq", () => {
    expect(supportsVision("groq")).toBe(false);
  });

  it("defaults to false for unknown providers", () => {
    expect(supportsVision("unknown-provider")).toBe(false);
  });
});
