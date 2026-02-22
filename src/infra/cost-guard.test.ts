import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CostGuard } from "./cost-guard.js";

describe("cost-guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-21T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("daily budget", () => {
    it("allows actions under budget", () => {
      const guard = new CostGuard({ maxCostPerDayCents: 5000 });
      guard.recordAction(100);
      expect(guard.check()).toBeNull();
    });

    it("blocks when daily budget exceeded", () => {
      const guard = new CostGuard({ maxCostPerDayCents: 500 });
      guard.recordAction(300);
      guard.recordAction(250);
      const result = guard.check();
      expect(result).not.toBeNull();
      expect(result!.type).toBe("daily_budget");
      if (result!.type === "daily_budget") {
        expect(result!.spentCents).toBe(550);
        expect(result!.limitCents).toBe(500);
      }
    });

    it("resets at UTC midnight", () => {
      const guard = new CostGuard({ maxCostPerDayCents: 500 });
      guard.recordAction(500);
      expect(guard.check()).not.toBeNull();

      // Advance to next UTC day.
      vi.setSystemTime(new Date("2026-02-22T00:00:01Z"));
      expect(guard.check()).toBeNull();
    });

    it("allows unlimited when maxCostPerDayCents is 0", () => {
      const guard = new CostGuard({ maxCostPerDayCents: 0 });
      guard.recordAction(999999);
      expect(guard.check()).toBeNull();
    });

    it("allows unlimited when maxCostPerDayCents is undefined", () => {
      const guard = new CostGuard({});
      guard.recordAction(999999);
      expect(guard.check()).toBeNull();
    });
  });

  describe("hourly rate limit", () => {
    it("allows actions under rate", () => {
      const guard = new CostGuard({ maxActionsPerHour: 100 });
      for (let i = 0; i < 50; i++) guard.recordAction(1);
      expect(guard.check()).toBeNull();
    });

    it("blocks when hourly rate exceeded", () => {
      const guard = new CostGuard({ maxActionsPerHour: 10 });
      for (let i = 0; i < 10; i++) guard.recordAction(1);
      const result = guard.check();
      expect(result).not.toBeNull();
      expect(result!.type).toBe("hourly_rate");
    });

    it("recovers after old actions slide out of window", () => {
      const guard = new CostGuard({ maxActionsPerHour: 5 });
      for (let i = 0; i < 5; i++) guard.recordAction(1);
      expect(guard.check()).not.toBeNull();

      // Advance 61 minutes — all actions slide out.
      vi.advanceTimersByTime(61 * 60 * 1000);
      expect(guard.check()).toBeNull();
    });

    it("allows unlimited when maxActionsPerHour is 0", () => {
      const guard = new CostGuard({ maxActionsPerHour: 0 });
      for (let i = 0; i < 1000; i++) guard.recordAction(1);
      expect(guard.check()).toBeNull();
    });
  });

  describe("combined limits", () => {
    it("blocks on whichever limit is hit first", () => {
      const guard = new CostGuard({ maxCostPerDayCents: 1000, maxActionsPerHour: 5 });
      // 5 cheap actions hit hourly limit, not daily.
      for (let i = 0; i < 5; i++) guard.recordAction(1);
      const result = guard.check();
      expect(result).not.toBeNull();
      expect(result!.type).toBe("hourly_rate");
    });

    it("blocks on daily budget even if hourly rate is fine", () => {
      const guard = new CostGuard({ maxCostPerDayCents: 100, maxActionsPerHour: 1000 });
      guard.recordAction(150);
      const result = guard.check();
      expect(result).not.toBeNull();
      expect(result!.type).toBe("daily_budget");
    });
  });

  describe("formatError", () => {
    it("formats daily budget message", () => {
      const msg = CostGuard.formatError({
        type: "daily_budget",
        spentCents: 5500,
        limitCents: 5000,
      });
      expect(msg).toContain("$55.00");
      expect(msg).toContain("$50.00");
      expect(msg).toContain("UTC midnight");
    });

    it("formats hourly rate message", () => {
      const msg = CostGuard.formatError({
        type: "hourly_rate",
        actions: 120,
        limit: 100,
      });
      expect(msg).toContain("120");
      expect(msg).toContain("100");
    });
  });

  describe("stats", () => {
    it("returns current state", () => {
      const guard = new CostGuard({ maxCostPerDayCents: 5000, maxActionsPerHour: 100 });
      guard.recordAction(250);
      guard.recordAction(150);
      const stats = guard.stats();
      expect(stats.dailyCostCents).toBe(400);
      expect(stats.actionsThisHour).toBe(2);
      expect(stats.currentDay).toBe("2026-02-21");
    });
  });
});
