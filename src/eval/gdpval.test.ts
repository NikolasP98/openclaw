import { describe, expect, it } from "vitest";
import {
  computeDollarValue,
  computeRoi,
  GDPValHarness,
  SAMPLE_BUSINESS_TASKS,
  SAMPLE_TECHNOLOGY_TASKS,
  type AgentFunction,
  type EvalFunction,
  type GDPValTask,
} from "./gdpval.js";

describe("gdpval", () => {
  describe("computeDollarValue", () => {
    it("computes quality × hours × wage", () => {
      // quality 0.85, 2h, $44.96/hr
      const value = computeDollarValue(0.85, 2, 44.96);
      expect(value).toBeCloseTo(76.43, 1);
    });

    it("returns 0 for zero quality", () => {
      expect(computeDollarValue(0, 5, 50)).toBe(0);
    });

    it("returns full value for perfect quality", () => {
      expect(computeDollarValue(1, 2, 50)).toBe(100);
    });
  });

  describe("computeRoi", () => {
    it("computes dollarValue / cost", () => {
      // $100 value, $5 cost (500 cents)
      expect(computeRoi(100, 500)).toBe(20);
    });

    it("returns Infinity for zero cost with positive value", () => {
      expect(computeRoi(100, 0)).toBe(Infinity);
    });

    it("returns 0 for zero value and zero cost", () => {
      expect(computeRoi(0, 0)).toBe(0);
    });
  });

  describe("GDPValHarness", () => {
    const tasks: GDPValTask[] = [
      {
        id: "test-1",
        title: "Test task",
        prompt: "Do something",
        occupation: "Developer",
        sector: "Tech",
        estimatedHours: 2,
        blsHourlyWage: 50,
        criteria: ["criterion-a", "criterion-b"],
        tags: ["coding"],
      },
      {
        id: "test-2",
        title: "Another task",
        prompt: "Do something else",
        occupation: "Analyst",
        sector: "Business",
        estimatedHours: 3,
        blsHourlyWage: 40,
        criteria: ["criterion-c"],
        tags: ["analysis"],
      },
    ];

    const mockAgent: AgentFunction = async (prompt) => ({
      output: `Response to: ${prompt.slice(0, 20)}`,
      durationMs: 1000,
      costCents: 5,
    });

    const mockEvaluator: EvalFunction = async ({ task }) => ({
      qualityScore: 0.8,
      criteriaScores: Object.fromEntries(task.criteria.map((c) => [c, 0.8])),
    });

    it("runs tasks and collects results", async () => {
      const harness = new GDPValHarness(tasks);
      const results = await harness.run(mockAgent, mockEvaluator);

      expect(results).toHaveLength(2);
      expect(results[0]!.taskId).toBe("test-1");
      expect(results[0]!.qualityScore).toBe(0.8);
      expect(results[0]!.dollarValue).toBeCloseTo(0.8 * 2 * 50); // 80
      expect(results[0]!.roi).toBeCloseTo(80 / 0.05); // 1600
    });

    it("computes summary statistics", async () => {
      const harness = new GDPValHarness(tasks);
      const results = await harness.run(mockAgent, mockEvaluator);
      const summary = harness.summary(results);

      expect(summary.totalTasks).toBe(2);
      expect(summary.avgQuality).toBe(0.8);
      expect(summary.totalDollarValue).toBeCloseTo(80 + 96); // 176
      expect(summary.totalCostCents).toBe(10);
      expect(summary.bySector).toHaveLength(2);
    });

    it("filters by sector", () => {
      const harness = new GDPValHarness(tasks);
      expect(harness.filterBySector("Tech")).toHaveLength(1);
      expect(harness.filterBySector("Business")).toHaveLength(1);
      expect(harness.filterBySector("Unknown")).toHaveLength(0);
    });

    it("filters by tag", () => {
      const harness = new GDPValHarness(tasks);
      expect(harness.filterByTag("coding")).toHaveLength(1);
      expect(harness.filterByTag("analysis")).toHaveLength(1);
    });

    it("reports taskCount", () => {
      expect(new GDPValHarness(tasks).taskCount).toBe(2);
      expect(new GDPValHarness([]).taskCount).toBe(0);
    });
  });

  describe("sample tasks", () => {
    it("includes technology tasks", () => {
      expect(SAMPLE_TECHNOLOGY_TASKS.length).toBeGreaterThanOrEqual(2);
      expect(SAMPLE_TECHNOLOGY_TASKS[0]!.sector).toContain("Technology");
    });

    it("includes business tasks", () => {
      expect(SAMPLE_BUSINESS_TASKS.length).toBeGreaterThanOrEqual(1);
      expect(SAMPLE_BUSINESS_TASKS[0]!.sector).toContain("Business");
    });

    it("all tasks have required fields", () => {
      for (const task of [...SAMPLE_TECHNOLOGY_TASKS, ...SAMPLE_BUSINESS_TASKS]) {
        expect(task.id).toBeTruthy();
        expect(task.prompt).toBeTruthy();
        expect(task.estimatedHours).toBeGreaterThan(0);
        expect(task.blsHourlyWage).toBeGreaterThan(0);
        expect(task.criteria.length).toBeGreaterThan(0);
        expect(task.tags.length).toBeGreaterThan(0);
      }
    });
  });
});
