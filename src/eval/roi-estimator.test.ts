import { describe, expect, it } from "vitest";
import {
  calculateROI,
  formatROISummary,
  getHourlyWage,
  getOccupationTitle,
  listOccupations,
} from "./roi-estimator.js";

describe("getHourlyWage", () => {
  it("returns median wage for software developer", () => {
    expect(getHourlyWage("software_developer")).toBe(63.44);
  });

  it("returns median wage for customer support", () => {
    expect(getHourlyWage("customer_support")).toBe(28.44);
  });
});

describe("listOccupations", () => {
  it("returns all occupation IDs", () => {
    const occupations = listOccupations();
    expect(occupations.length).toBeGreaterThanOrEqual(8);
    expect(occupations).toContain("software_developer");
    expect(occupations).toContain("general_office");
  });
});

describe("getOccupationTitle", () => {
  it("returns BLS title", () => {
    expect(getOccupationTitle("software_developer")).toBe("Software Developers");
  });
});

describe("calculateROI", () => {
  it("calculates positive ROI for typical automation", () => {
    const result = calculateROI({
      hoursAutomatedPerMonth: 40,
      occupation: "software_developer",
      monthlyApiCost: 200,
      monthlyInfraCost: 50,
    });

    // 40h * $63.44 = $2537.60 savings
    expect(result.monthlySavings).toBeCloseTo(2537.6, 0);
    expect(result.monthlyAiCost).toBe(250);
    expect(result.netMonthlyBenefit).toBeCloseTo(2287.6, 0);
    expect(result.roiPercent).toBeGreaterThan(0);
    expect(result.paybackMonths).not.toBeNull();
    expect(result.annualNetBenefit).toBeCloseTo(2287.6 * 12, 0);
  });

  it("handles negative ROI when AI cost exceeds savings", () => {
    const result = calculateROI({
      hoursAutomatedPerMonth: 1,
      occupation: "general_office",
      monthlyApiCost: 500,
    });

    // 1h * $19.28 = $19.28 savings vs $500 cost
    expect(result.netMonthlyBenefit).toBeLessThan(0);
    expect(result.paybackMonths).toBeNull();
  });

  it("uses custom hourly rate when provided", () => {
    const result = calculateROI({
      hoursAutomatedPerMonth: 10,
      occupation: "software_developer",
      monthlyApiCost: 50,
      customHourlyRate: 100,
    });

    expect(result.hourlyRate).toBe(100);
    expect(result.monthlySavings).toBe(1000);
  });

  it("handles zero API cost (free/local models)", () => {
    const result = calculateROI({
      hoursAutomatedPerMonth: 20,
      occupation: "customer_support",
      monthlyApiCost: 0,
    });

    expect(result.monthlyAiCost).toBe(0);
    expect(result.roiPercent).toBe(Infinity);
    expect(result.netMonthlyBenefit).toBeGreaterThan(0);
  });

  it("handles zero hours automated", () => {
    const result = calculateROI({
      hoursAutomatedPerMonth: 0,
      occupation: "software_developer",
      monthlyApiCost: 100,
    });

    expect(result.monthlySavings).toBe(0);
    expect(result.netMonthlyBenefit).toBe(-100);
  });
});

describe("formatROISummary", () => {
  it("formats a positive ROI result", () => {
    const result = calculateROI({
      hoursAutomatedPerMonth: 40,
      occupation: "software_developer",
      monthlyApiCost: 200,
    });

    const summary = formatROISummary(result);
    expect(summary).toContain("Monthly labor savings:");
    expect(summary).toContain("Monthly AI cost:");
    expect(summary).toContain("ROI:");
    expect(summary).toContain("Annual net benefit:");
    expect(summary).toContain("Payback period:");
  });

  it("shows infinity for zero-cost ROI", () => {
    const result = calculateROI({
      hoursAutomatedPerMonth: 10,
      occupation: "customer_support",
      monthlyApiCost: 0,
    });

    const summary = formatROISummary(result);
    expect(summary).toContain("∞");
  });
});
