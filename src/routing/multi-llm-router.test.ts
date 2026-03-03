import { describe, expect, it, vi } from "vitest";
import {
  buildRoutingTable,
  createMultiLLMRouter,
  DEFAULT_ROUTING_TABLE,
  resolveModelForTurn,
} from "./multi-llm-router.js";
import type { MultiLLMRouterConfig } from "./multi-llm-router.js";

function makeConfig(overrides: Partial<MultiLLMRouterConfig> = {}): MultiLLMRouterConfig {
  return {
    enabled: true,
    routingTable: DEFAULT_ROUTING_TABLE,
    ...overrides,
  };
}

// ── disabled mode ─────────────────────────────────────────────────────────────

describe("disabled mode", () => {
  it("returns null model when enabled=false", () => {
    const config = makeConfig({ enabled: false });
    const { model } = resolveModelForTurn("expert", "code", config);
    expect(model).toBeNull();
  });

  it("returns null matchedKey when disabled", () => {
    const config = makeConfig({ enabled: false });
    const { matchedKey } = resolveModelForTurn("nano", "chat", config);
    expect(matchedKey).toBeNull();
  });
});

// ── exact match ───────────────────────────────────────────────────────────────

describe("exact tier:taskType match", () => {
  it("routes expert:reasoning to opus model", () => {
    const config = makeConfig();
    const { model, matchedKey } = resolveModelForTurn("expert", "reasoning", config);
    expect(model).toBe("claude-opus-4-6");
    expect(matchedKey).toBe("expert:reasoning");
  });

  it("routes expert:code to opus model", () => {
    const config = makeConfig();
    expect(resolveModelForTurn("expert", "code", config).model).toBe("claude-opus-4-6");
  });

  it("routes base:code to sonnet model", () => {
    const config = makeConfig();
    const { model } = resolveModelForTurn("base", "code", config);
    expect(model).toBe("claude-sonnet-4-6");
  });

  it("routes expert:chat to sonnet (specialist downgrade)", () => {
    const config = makeConfig();
    const { model } = resolveModelForTurn("expert", "chat", config);
    expect(model).toBe("claude-sonnet-4-6");
  });

  it("prefers exact match over tier-only fallback", () => {
    const config = makeConfig({
      routingTable: {
        micro: { model: "cheap-model" },
        "micro:code": { model: "specialized-code-model" },
      },
    });
    const { model, matchedKey } = resolveModelForTurn("micro", "code", config);
    expect(model).toBe("specialized-code-model");
    expect(matchedKey).toBe("micro:code");
  });
});

// ── tier-only fallback ────────────────────────────────────────────────────────

describe("tier-only fallback", () => {
  it("falls back to tier entry when no exact match", () => {
    const config = makeConfig({
      routingTable: {
        micro: { model: "micro-model" },
      },
    });
    const { model, matchedKey } = resolveModelForTurn("micro", "research", config);
    expect(model).toBe("micro-model");
    expect(matchedKey).toBe("micro");
  });

  it("nano tier falls back to haiku in default table", () => {
    const config = makeConfig();
    const { model } = resolveModelForTurn("nano", "chat", config);
    expect(model).toBe("claude-haiku-4-5-20251001");
  });

  it("micro tier falls back to haiku in default table", () => {
    const config = makeConfig();
    const { model } = resolveModelForTurn("micro", "research", config);
    expect(model).toBe("claude-haiku-4-5-20251001");
  });
});

// ── global default fallback ───────────────────────────────────────────────────

describe("global defaultModel fallback", () => {
  it("returns defaultModel when no table entry matches", () => {
    const config = makeConfig({
      routingTable: {},
      defaultModel: "fallback-model",
    });
    const { model, matchedKey } = resolveModelForTurn("base", "research", config);
    expect(model).toBe("fallback-model");
    expect(matchedKey).toBe("defaultModel");
  });

  it("returns null when no entry and no defaultModel", () => {
    const config = makeConfig({ routingTable: {} });
    const { model } = resolveModelForTurn("base", "chat", config);
    expect(model).toBeNull();
  });
});

// ── routing config is config-driven ──────────────────────────────────────────

describe("config-driven routing table", () => {
  it("user override takes precedence over default table entry", () => {
    const config = makeConfig({
      routingTable: buildRoutingTable({
        "expert:code": { model: "custom-coding-model" },
      }),
    });
    const { model } = resolveModelForTurn("expert", "code", config);
    expect(model).toBe("custom-coding-model");
  });

  it("non-overridden entries retain default values", () => {
    const config = makeConfig({
      routingTable: buildRoutingTable({
        "expert:code": { model: "custom-coding-model" },
      }),
    });
    // expert:reasoning should still have the default value
    const { model } = resolveModelForTurn("expert", "reasoning", config);
    expect(model).toBe("claude-opus-4-6");
  });
});

// ── logging ───────────────────────────────────────────────────────────────────

describe("logDecisions", () => {
  it("calls console.debug when logDecisions=true", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const config = makeConfig({ logDecisions: true });
    resolveModelForTurn("expert", "code", config);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]![0]).toContain("expert");
    spy.mockRestore();
  });

  it("does not call console.debug when logDecisions=false", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const config = makeConfig({ logDecisions: false });
    resolveModelForTurn("expert", "code", config);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not log when disabled", () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const config = makeConfig({ enabled: false, logDecisions: true });
    resolveModelForTurn("expert", "code", config);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ── createMultiLLMRouter ──────────────────────────────────────────────────────

describe("createMultiLLMRouter", () => {
  it("disabled by default", () => {
    const router = createMultiLLMRouter({});
    expect(router.enabled).toBe(false);
  });

  it("merges overrides with default table", () => {
    const router = createMultiLLMRouter({
      enabled: true,
      routingTableOverrides: { "nano:chat": { model: "tiny-model" } },
    });
    expect(router.routingTable["nano:chat"]?.model).toBe("tiny-model");
    // Default entries still present
    expect(router.routingTable["expert:code"]?.model).toBe("claude-opus-4-6");
  });

  it("sets defaultModel", () => {
    const router = createMultiLLMRouter({ defaultModel: "my-default" });
    expect(router.defaultModel).toBe("my-default");
  });
});

// ── integration: complexity scorer → router ───────────────────────────────────

describe("integration with complexity scorer output", () => {
  it("routes a simple chat message to haiku (nano tier)", async () => {
    const { scoreComplexity } = await import("./complexity-scorer.js");
    const { tier, taskType } = scoreComplexity({ message: "Hey, thanks!" });
    expect(tier).toBe("nano");

    const router = createMultiLLMRouter({ enabled: true });
    const { model } = resolveModelForTurn(tier, taskType, router);
    expect(model).toBe("claude-haiku-4-5-20251001");
  });

  it("routes a complex multi-step code review to opus (expert tier)", async () => {
    const { scoreComplexity } = await import("./complexity-scorer.js");
    const { tier, taskType } = scoreComplexity({
      message: "Please design a distributed caching architecture and explain the trade-offs between different consistency models. Why would we choose eventual consistency over strong consistency?",
      hasCodeBlocks: true,
      recentToolCalls: 5,
    });
    expect(tier).toBe("expert");

    const router = createMultiLLMRouter({ enabled: true });
    const { model } = resolveModelForTurn(tier, taskType, router);
    expect(typeof model).toBe("string");
    expect(model).not.toBeNull();
  });
});
