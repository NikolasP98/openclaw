import { describe, expect, it, beforeEach } from "vitest";
import {
  clearRegistry,
  getToolMetadata,
  getToolRateLimit,
  getToolRiskTier,
  isToolRegistered,
  listRegisteredTools,
  registerBuiltinTools,
  registeredToolCount,
  registerTool,
} from "./tool-registry.js";

describe("tool-registry", () => {
  beforeEach(() => clearRegistry());

  describe("registerTool / getToolMetadata", () => {
    it("registers and retrieves tool metadata", () => {
      registerTool({
        name: "my_tool",
        description: "A test tool",
        riskTier: "low",
        category: "filesystem",
      });
      const meta = getToolMetadata("my_tool");
      expect(meta).toBeDefined();
      expect(meta!.name).toBe("my_tool");
      expect(meta!.riskTier).toBe("low");
    });

    it("normalizes tool names (case + hyphens)", () => {
      registerTool({ name: "Web-Search", description: "Search", riskTier: "medium", category: "search" });
      expect(getToolMetadata("web_search")).toBeDefined();
      expect(getToolMetadata("Web-Search")).toBeDefined();
    });

    it("returns undefined for unregistered tools", () => {
      expect(getToolMetadata("nonexistent")).toBeUndefined();
    });
  });

  describe("getToolRiskTier", () => {
    it("returns registered risk tier", () => {
      registerTool({ name: "exec", description: "Run commands", riskTier: "high", category: "execution" });
      expect(getToolRiskTier("exec")).toBe("high");
    });

    it("returns medium for unknown tools", () => {
      expect(getToolRiskTier("unknown_tool")).toBe("medium");
    });
  });

  describe("getToolRateLimit", () => {
    it("returns rate limit when configured", () => {
      registerTool({
        name: "web_search",
        description: "Search web",
        riskTier: "medium",
        category: "search",
        rateLimit: { maxCalls: 20, windowSecs: 60 },
      });
      const limit = getToolRateLimit("web_search");
      expect(limit).toEqual({ maxCalls: 20, windowSecs: 60 });
    });

    it("returns undefined when no rate limit", () => {
      registerTool({ name: "read", description: "Read file", riskTier: "low", category: "filesystem" });
      expect(getToolRateLimit("read")).toBeUndefined();
    });
  });

  describe("listRegisteredTools", () => {
    it("lists all tools", () => {
      registerTool({ name: "a", description: "A", riskTier: "low", category: "filesystem" });
      registerTool({ name: "b", description: "B", riskTier: "high", category: "execution" });
      expect(listRegisteredTools()).toHaveLength(2);
    });

    it("filters by category", () => {
      registerTool({ name: "read", description: "Read", riskTier: "low", category: "filesystem" });
      registerTool({ name: "exec", description: "Exec", riskTier: "high", category: "execution" });
      registerTool({ name: "write", description: "Write", riskTier: "medium", category: "filesystem" });
      expect(listRegisteredTools("filesystem")).toHaveLength(2);
      expect(listRegisteredTools("execution")).toHaveLength(1);
      expect(listRegisteredTools("memory")).toHaveLength(0);
    });
  });

  describe("registerBuiltinTools", () => {
    it("registers all built-in tools", () => {
      registerBuiltinTools();
      expect(registeredToolCount()).toBeGreaterThanOrEqual(15);
    });

    it("includes core tools with correct risk tiers", () => {
      registerBuiltinTools();
      expect(getToolRiskTier("read")).toBe("low");
      expect(getToolRiskTier("exec")).toBe("high");
      expect(getToolRiskTier("write")).toBe("medium");
      expect(getToolRiskTier("gateway")).toBe("high");
    });

    it("sets rate limits on web tools", () => {
      registerBuiltinTools();
      expect(getToolRateLimit("web_search")).toBeDefined();
      expect(getToolRateLimit("web_fetch")).toBeDefined();
      expect(getToolRateLimit("message")).toBeDefined();
    });

    it("marks dangerous tools for sub-agents", () => {
      registerBuiltinTools();
      expect(getToolMetadata("exec")?.dangerousForSubagents).toBe(true);
      expect(getToolMetadata("gateway")?.dangerousForSubagents).toBe(true);
      expect(getToolMetadata("read")?.dangerousForSubagents).toBeUndefined();
    });
  });

  describe("isToolRegistered", () => {
    it("returns true for registered tools", () => {
      registerTool({ name: "test", description: "Test", riskTier: "low", category: "filesystem" });
      expect(isToolRegistered("test")).toBe(true);
    });

    it("returns false for unregistered tools", () => {
      expect(isToolRegistered("nope")).toBe(false);
    });
  });
});
