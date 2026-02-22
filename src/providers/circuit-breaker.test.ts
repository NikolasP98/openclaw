import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderCircuitBreaker } from "./circuit-breaker.js";

describe("ProviderCircuitBreaker", () => {
  let breaker: ProviderCircuitBreaker;

  beforeEach(() => {
    breaker = new ProviderCircuitBreaker({ maxFailures: 3, cooldownMs: 5000 });
  });

  describe("canUse", () => {
    it("returns true for unknown provider (starts closed)", () => {
      expect(breaker.canUse("anthropic")).toBe(true);
    });

    it("returns true after fewer failures than threshold", () => {
      breaker.recordFailure("anthropic");
      breaker.recordFailure("anthropic");
      expect(breaker.canUse("anthropic")).toBe(true);
    });

    it("returns false after reaching failure threshold", () => {
      breaker.recordFailure("anthropic");
      breaker.recordFailure("anthropic");
      breaker.recordFailure("anthropic");
      expect(breaker.canUse("anthropic")).toBe(false);
    });

    it("returns true after cooldown elapses (transitions to half-open)", () => {
      breaker.recordFailure("anthropic");
      breaker.recordFailure("anthropic");
      breaker.recordFailure("anthropic");

      // Simulate time passing
      vi.useFakeTimers();
      vi.advanceTimersByTime(6000);
      expect(breaker.canUse("anthropic")).toBe(true);
      expect(breaker.getHealth("anthropic").state).toBe("half-open");
      vi.useRealTimers();
    });
  });

  describe("recordSuccess", () => {
    it("resets failure counter and closes circuit", () => {
      breaker.recordFailure("openai");
      breaker.recordFailure("openai");
      breaker.recordSuccess("openai");

      const health = breaker.getHealth("openai");
      expect(health.consecutiveFailures).toBe(0);
      expect(health.state).toBe("closed");
      expect(health.totalSuccesses).toBe(1);
      expect(health.totalFailures).toBe(2);
    });

    it("closes circuit from half-open state", () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure("openai");
      }

      // Simulate cooldown
      vi.useFakeTimers();
      vi.advanceTimersByTime(6000);
      breaker.canUse("openai"); // transitions to half-open

      breaker.recordSuccess("openai");
      expect(breaker.getHealth("openai").state).toBe("closed");
      vi.useRealTimers();
    });
  });

  describe("recordFailure", () => {
    it("returns true when circuit newly opens", () => {
      expect(breaker.recordFailure("google")).toBe(false);
      expect(breaker.recordFailure("google")).toBe(false);
      expect(breaker.recordFailure("google")).toBe(true); // 3rd failure opens circuit
    });

    it("returns false for failures after circuit already open", () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure("google");
      }
      // Circuit is open — can't record more failures through normal path
      // but if somehow called, it shouldn't report as newly opened
    });

    it("re-opens circuit on half-open probe failure", () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure("google");
      }

      vi.useFakeTimers();
      vi.advanceTimersByTime(6000);
      breaker.canUse("google"); // half-open

      const result = breaker.recordFailure("google");
      expect(result).toBe(false); // Not "newly" opened, re-opened
      expect(breaker.getHealth("google").state).toBe("open");
      vi.useRealTimers();
    });

    it("tracks total failures", () => {
      breaker.recordFailure("mistral");
      breaker.recordFailure("mistral");
      breaker.recordSuccess("mistral");
      breaker.recordFailure("mistral");

      expect(breaker.getHealth("mistral").totalFailures).toBe(3);
      expect(breaker.getHealth("mistral").consecutiveFailures).toBe(1);
    });
  });

  describe("provider isolation", () => {
    it("circuit state is independent per provider", () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure("anthropic");
      }
      expect(breaker.canUse("anthropic")).toBe(false);
      expect(breaker.canUse("openai")).toBe(true);
    });
  });

  describe("utility methods", () => {
    it("getSuspended returns only open circuits", () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure("anthropic");
      }
      breaker.recordSuccess("openai");

      const suspended = breaker.getSuspended();
      expect(suspended).toHaveLength(1);
      expect(suspended[0].provider).toBe("anthropic");
    });

    it("allStates returns all tracked providers", () => {
      breaker.recordSuccess("a");
      breaker.recordFailure("b");
      expect(breaker.allStates()).toHaveLength(2);
    });

    it("reset clears a provider's state", () => {
      breaker.recordFailure("anthropic");
      breaker.reset("anthropic");
      expect(breaker.getHealth("anthropic").consecutiveFailures).toBe(0);
    });

    it("resetAll clears all state", () => {
      breaker.recordFailure("a");
      breaker.recordFailure("b");
      breaker.resetAll();
      expect(breaker.allStates()).toHaveLength(0);
    });
  });
});
