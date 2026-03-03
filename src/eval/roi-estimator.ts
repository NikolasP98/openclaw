/**
 * ROI estimator — calculate return on investment for AI agent usage.
 *
 * Compares the cost of running AI agents (API costs + infrastructure)
 * against the human labor cost that would be required to perform the
 * same tasks. Uses BLS wage data for occupation-based estimation.
 *
 * @module
 */

import blsData from "./bls-wages.json" with { type: "json" };

// ── Types ────────────────────────────────────────────────────────────────────

export type OccupationId = keyof typeof blsData.occupations;

export type ROIInput = {
  /** Hours of human work automated per month. */
  hoursAutomatedPerMonth: number;
  /** Occupation being automated (for wage lookup). */
  occupation: OccupationId;
  /** Monthly AI API cost in USD. */
  monthlyApiCost: number;
  /** Monthly infrastructure cost in USD (server, hosting, etc). */
  monthlyInfraCost?: number;
  /** Optional: custom hourly rate override (skips BLS lookup). */
  customHourlyRate?: number;
};

export type ROIResult = {
  /** Monthly human labor cost saved. */
  monthlySavings: number;
  /** Total monthly AI cost (API + infra). */
  monthlyAiCost: number;
  /** Net monthly benefit (savings - AI cost). */
  netMonthlyBenefit: number;
  /** ROI percentage: (benefit / cost) * 100. */
  roiPercent: number;
  /** Months to break even (if net benefit > 0). */
  paybackMonths: number | null;
  /** Hourly rate used for calculation. */
  hourlyRate: number;
  /** Annual projection of net benefit. */
  annualNetBenefit: number;
};

// ── Wage Lookup ──────────────────────────────────────────────────────────────

/**
 * Get the median hourly wage for an occupation.
 */
export function getHourlyWage(occupation: OccupationId): number {
  const occ = blsData.occupations[occupation];
  return occ?.medianHourly ?? 0;
}

/**
 * List all available occupation IDs.
 */
export function listOccupations(): OccupationId[] {
  return Object.keys(blsData.occupations) as OccupationId[];
}

/**
 * Get occupation display title.
 */
export function getOccupationTitle(occupation: OccupationId): string {
  return blsData.occupations[occupation]?.title ?? occupation;
}

// ── ROI Calculation ──────────────────────────────────────────────────────────

/**
 * Calculate ROI for automating work with AI agents.
 */
export function calculateROI(input: ROIInput): ROIResult {
  const hourlyRate = input.customHourlyRate ?? getHourlyWage(input.occupation);
  const monthlySavings = input.hoursAutomatedPerMonth * hourlyRate;
  const monthlyAiCost = input.monthlyApiCost + (input.monthlyInfraCost ?? 0);
  const netMonthlyBenefit = monthlySavings - monthlyAiCost;

  const roiPercent =
    monthlyAiCost > 0
      ? Math.round((netMonthlyBenefit / monthlyAiCost) * 10000) / 100
      : monthlySavings > 0
        ? Infinity
        : 0;

  // Payback months: only meaningful if there's an upfront cost and positive benefit
  const paybackMonths =
    netMonthlyBenefit > 0 ? Math.round((monthlyAiCost / netMonthlyBenefit) * 100) / 100 : null;

  return {
    monthlySavings: Math.round(monthlySavings * 100) / 100,
    monthlyAiCost: Math.round(monthlyAiCost * 100) / 100,
    netMonthlyBenefit: Math.round(netMonthlyBenefit * 100) / 100,
    roiPercent,
    paybackMonths,
    hourlyRate,
    annualNetBenefit: Math.round(netMonthlyBenefit * 12 * 100) / 100,
  };
}

/**
 * Format ROI result as a human-readable summary.
 */
export function formatROISummary(result: ROIResult): string {
  const lines = [
    `Monthly labor savings: $${result.monthlySavings.toLocaleString()}`,
    `Monthly AI cost: $${result.monthlyAiCost.toLocaleString()}`,
    `Net monthly benefit: $${result.netMonthlyBenefit.toLocaleString()}`,
    `ROI: ${result.roiPercent === Infinity ? "∞" : `${result.roiPercent}%`}`,
    `Annual net benefit: $${result.annualNetBenefit.toLocaleString()}`,
  ];
  if (result.paybackMonths !== null) {
    lines.push(`Payback period: ${result.paybackMonths} months`);
  }
  return lines.join("\n");
}
