import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRateLimiter } from "./rate-limiter.js";

describe("tool-rate-limiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("tryCall", () => {
    it("allows calls for unconfigured tools (unlimited)", () => {
      const limiter = new ToolRateLimiter();
      for (let i = 0; i < 100; i++) {
        const result = limiter.tryCall("unconfigured_tool");
        expect(result.allowed).toBe(true);
      }
    });

    it("allows calls within limit", () => {
      const limiter = new ToolRateLimiter({ web_search: { maxCalls: 5, windowSecs: 60 } });
      for (let i = 0; i < 5; i++) {
        const result = limiter.tryCall("web_search");
        expect(result.allowed).toBe(true);
      }
    });

    it("blocks when limit exceeded", () => {
      const limiter = new ToolRateLimiter({ web_search: { maxCalls: 3, windowSecs: 60 } });
      limiter.tryCall("web_search");
      limiter.tryCall("web_search");
      limiter.tryCall("web_search");
      const result = limiter.tryCall("web_search");
      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.currentCount).toBe(3);
      expect(result.limit).toBe(3);
    });

    it("recovers after window expires", () => {
      const limiter = new ToolRateLimiter({ web_search: { maxCalls: 2, windowSecs: 60 } });
      limiter.tryCall("web_search");
      limiter.tryCall("web_search");
      expect(limiter.tryCall("web_search").allowed).toBe(false);

      // Advance 61 seconds.
      vi.advanceTimersByTime(61_000);
      const result = limiter.tryCall("web_search");
      expect(result.allowed).toBe(true);
    });

    it("tracks separate windows per tool", () => {
      const limiter = new ToolRateLimiter({
        web_search: { maxCalls: 2, windowSecs: 60 },
        email_send: { maxCalls: 1, windowSecs: 300 },
      });

      limiter.tryCall("web_search");
      limiter.tryCall("web_search");
      expect(limiter.tryCall("web_search").allowed).toBe(false);
      // email_send should still be available.
      expect(limiter.tryCall("email_send").allowed).toBe(true);
      expect(limiter.tryCall("email_send").allowed).toBe(false);
    });

    it("normalizes tool names (case + hyphens)", () => {
      const limiter = new ToolRateLimiter({ web_search: { maxCalls: 1, windowSecs: 60 } });
      limiter.tryCall("Web-Search");
      expect(limiter.tryCall("web_search").allowed).toBe(false);
    });

    it("returns retryAfter based on oldest call expiry", () => {
      const limiter = new ToolRateLimiter({ test: { maxCalls: 2, windowSecs: 60 } });
      limiter.tryCall("test"); // t=0
      vi.advanceTimersByTime(20_000); // t=20s
      limiter.tryCall("test"); // t=20s
      vi.advanceTimersByTime(10_000); // t=30s

      const result = limiter.tryCall("test");
      expect(result.allowed).toBe(false);
      // Oldest call at t=0 expires at t=60s. Current is t=30s. So retry in ~30s.
      expect(result.retryAfter).toBe(30);
    });
  });

  describe("wouldAllow", () => {
    it("returns true for unconfigured tools", () => {
      const limiter = new ToolRateLimiter();
      expect(limiter.wouldAllow("anything")).toBe(true);
    });

    it("returns false when limit is reached (without recording)", () => {
      const limiter = new ToolRateLimiter({ test: { maxCalls: 1, windowSecs: 60 } });
      limiter.tryCall("test");
      expect(limiter.wouldAllow("test")).toBe(false);
    });
  });

  describe("setConfig", () => {
    it("adds config at runtime", () => {
      const limiter = new ToolRateLimiter();
      expect(limiter.tryCall("new_tool").limit).toBe(0); // unlimited

      limiter.setConfig("new_tool", { maxCalls: 3, windowSecs: 60 });
      limiter.tryCall("new_tool");
      limiter.tryCall("new_tool");
      limiter.tryCall("new_tool");
      expect(limiter.tryCall("new_tool").allowed).toBe(false);
    });
  });

  describe("stats", () => {
    it("returns empty for no configs", () => {
      const limiter = new ToolRateLimiter();
      expect(limiter.stats()).toEqual([]);
    });

    it("returns current state per tool", () => {
      const limiter = new ToolRateLimiter({
        web_search: { maxCalls: 5, windowSecs: 60 },
        email: { maxCalls: 2, windowSecs: 300 },
      });
      limiter.tryCall("web_search");
      limiter.tryCall("web_search");
      const stats = limiter.stats();
      expect(stats).toHaveLength(2);
      const ws = stats.find((s) => s.tool === "web_search");
      expect(ws?.currentCount).toBe(2);
      expect(ws?.allowed).toBe(true);
    });
  });

  describe("formatError", () => {
    it("formats human-readable error", () => {
      const msg = ToolRateLimiter.formatError("web_search", {
        allowed: false,
        retryAfter: 30,
        currentCount: 5,
        limit: 5,
      });
      expect(msg).toContain("web_search");
      expect(msg).toContain("5/5");
      expect(msg).toContain("30 seconds");
    });
  });
});
