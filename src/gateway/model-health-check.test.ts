import { beforeEach, describe, expect, it, vi } from "vitest";
import { runModelHealthChecks } from "./model-health-check.js";

const mockLog = { info: vi.fn(), warn: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runModelHealthChecks", () => {
  it("returns empty array when routing is disabled", async () => {
    const results = await runModelHealthChecks({
      routing: { enabled: false },
      log: mockLog,
    });
    expect(results).toEqual([]);
  });

  it("returns empty array when routing config is undefined", async () => {
    const results = await runModelHealthChecks({
      routing: undefined,
      log: mockLog,
    });
    expect(results).toEqual([]);
  });

  it("returns empty array when no models configured", async () => {
    const results = await runModelHealthChecks({
      routing: { enabled: true },
      log: mockLog,
    });
    expect(results).toEqual([]);
  });

  it("skips non-local providers", async () => {
    const results = await runModelHealthChecks({
      routing: {
        enabled: true,
        fastModel: "anthropic/claude-haiku",
      },
      log: mockLog,
    });
    expect(results).toEqual([]);
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("Skipping health check for non-local provider"),
    );
  });

  it("handles unreachable Ollama server gracefully", async () => {
    // Use a port that's almost certainly not running
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    try {
      const results = await runModelHealthChecks({
        routing: {
          enabled: true,
          fastModel: "ollama/tiny-model",
        },
        log: mockLog,
      });
      expect(results).toHaveLength(1);
      expect(results[0].reachable).toBe(false);
      expect(results[0].error).toContain("not reachable");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("checks both fast and local models", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    try {
      const results = await runModelHealthChecks({
        routing: {
          enabled: true,
          fastModel: "ollama/small",
          localModel: "ollama/medium",
        },
        log: mockLog,
      });
      expect(results).toHaveLength(2);
      expect(results[0].model).toBe("small");
      expect(results[1].model).toBe("medium");
    } finally {
      global.fetch = vi.fn();
    }
  });

  it("handles successful Ollama health check", async () => {
    const mockFetch = vi.fn();
    // /api/tags — server reachable
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
    // /api/show — model found
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          parameters: "num_ctx 32768",
          model_info: { "general.context_length": 32768 },
        }),
    });
    // /api/generate — warmup
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    global.fetch = mockFetch;

    try {
      const results = await runModelHealthChecks({
        routing: {
          enabled: true,
          fastModel: "ollama/qwen3:1.7b",
        },
        log: mockLog,
      });
      expect(results).toHaveLength(1);
      expect(results[0].reachable).toBe(true);
      expect(results[0].modelFound).toBe(true);
      expect(results[0].contextWindow).toBe(32768);
      expect(results[0].warmedUp).toBe(true);
    } finally {
      global.fetch = vi.fn();
    }
  });

  it("reports model not found on Ollama", async () => {
    const mockFetch = vi.fn();
    // /api/tags — server reachable
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
    // /api/show — model not found
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    global.fetch = mockFetch;

    try {
      const results = await runModelHealthChecks({
        routing: {
          enabled: true,
          fastModel: "ollama/nonexistent",
        },
        log: mockLog,
      });
      expect(results).toHaveLength(1);
      expect(results[0].reachable).toBe(true);
      expect(results[0].modelFound).toBe(false);
      expect(results[0].error).toContain("not found");
      expect(results[0].error).toContain("ollama pull nonexistent");
    } finally {
      global.fetch = vi.fn();
    }
  });

  it("handles OpenAI-compatible servers", async () => {
    const mockFetch = vi.fn();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ id: "my-model" }, { id: "other-model" }],
        }),
    });

    global.fetch = mockFetch;

    try {
      const results = await runModelHealthChecks({
        routing: {
          enabled: true,
          fastModel: "lmstudio/my-model",
        },
        log: mockLog,
      });
      expect(results).toHaveLength(1);
      expect(results[0].reachable).toBe(true);
      expect(results[0].modelFound).toBe(true);
    } finally {
      global.fetch = vi.fn();
    }
  });
});
