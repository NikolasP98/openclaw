/**
 * Tests for built-in shorthand model aliases (Sprint Y.2).
 *
 * Verifies that common shorthands like "claude", "opus", "flash", "gpt4"
 * resolve to the correct provider/model without any user configuration.
 */
import { describe, expect, it } from "vitest";
import type { MinionConfig } from "../../config/config.js";
import { buildModelAliasIndex, resolveModelRefFromString } from "./model-selection.js";

describe("buildModelAliasIndex — built-in shorthand aliases (Sprint Y.2)", () => {
  const emptyIndex = () =>
    buildModelAliasIndex({
      cfg: {} as MinionConfig,
      defaultProvider: "anthropic",
    });

  it("resolves Anthropic shorthands", () => {
    const index = emptyIndex();
    expect(index.byAlias.get("claude")?.ref.provider).toBe("anthropic");
    expect(index.byAlias.get("claude")?.ref.model).toContain("sonnet");
    expect(index.byAlias.get("sonnet")?.ref.provider).toBe("anthropic");
    expect(index.byAlias.get("opus")?.ref.provider).toBe("anthropic");
    expect(index.byAlias.get("haiku")?.ref.provider).toBe("anthropic");
  });

  it("resolves OpenAI shorthands", () => {
    const index = emptyIndex();
    expect(index.byAlias.get("gpt4")?.ref.provider).toBe("openai");
    expect(index.byAlias.get("mini")?.ref.provider).toBe("openai");
    expect(index.byAlias.get("o1")?.ref.provider).toBe("openai");
    expect(index.byAlias.get("o3")?.ref.provider).toBe("openai");
  });

  it("resolves Google shorthands", () => {
    const index = emptyIndex();
    expect(index.byAlias.get("gemini")?.ref.provider).toBe("google");
    expect(index.byAlias.get("flash")?.ref.provider).toBe("google");
  });

  it("resolves DeepSeek shorthands", () => {
    const index = emptyIndex();
    expect(index.byAlias.get("deepseek")?.ref.provider).toBe("deepseek");
    expect(index.byAlias.get("r1")?.ref.provider).toBe("deepseek");
  });

  it("resolves xAI shorthands", () => {
    const index = emptyIndex();
    expect(index.byAlias.get("grok")?.ref.provider).toBe("xai");
  });

  it("resolveModelRefFromString uses built-in alias without config", () => {
    const index = emptyIndex();
    const result = resolveModelRefFromString({
      raw: "claude",
      defaultProvider: "anthropic",
      aliasIndex: index,
    });
    expect(result?.ref.provider).toBe("anthropic");
    expect(result?.alias).toBe("claude");
  });

  it("resolveModelRefFromString resolves 'flash' alias", () => {
    const index = emptyIndex();
    const result = resolveModelRefFromString({
      raw: "flash",
      defaultProvider: "anthropic",
      aliasIndex: index,
    });
    expect(result?.ref.provider).toBe("google");
    expect(result?.ref.model).toContain("flash");
  });

  it("user config alias overrides built-in shorthand", () => {
    const cfg: Partial<MinionConfig> = {
      agents: {
        defaults: {
          models: {
            // Override "claude" to point to haiku instead
            "anthropic/claude-haiku-3.5": { alias: "claude" },
          },
        },
      },
    };
    const index = buildModelAliasIndex({
      cfg: cfg as MinionConfig,
      defaultProvider: "anthropic",
    });
    // User override wins
    expect(index.byAlias.get("claude")?.ref.model).toBe("claude-haiku-3.5");
  });

  it("user config adds extra aliases alongside built-ins", () => {
    const cfg: Partial<MinionConfig> = {
      agents: {
        defaults: {
          models: {
            "openai/gpt-4o": { alias: "smart" },
          },
        },
      },
    };
    const index = buildModelAliasIndex({
      cfg: cfg as MinionConfig,
      defaultProvider: "openai",
    });
    // User's alias present
    expect(index.byAlias.get("smart")?.ref.model).toBe("gpt-4o");
    // Built-in still present
    expect(index.byAlias.get("claude")?.ref.provider).toBe("anthropic");
  });
});
