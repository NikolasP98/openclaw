/**
 * CLI ROI command — calculate return on investment for AI agent usage.
 *
 * Wraps the ROI estimator module as `minion roi`.
 *
 * @module
 */

import {
  type OccupationId,
  calculateROI,
  formatROISummary,
  getHourlyWage,
  getOccupationTitle,
  listOccupations,
} from "../../eval/roi-estimator.js";
import type { RuntimeEnv } from "../../runtime.js";

export type RoiCommandOpts = {
  hours?: string;
  occupation?: string;
  rate?: string;
  apiCost?: string;
  infraCost?: string;
  listOccupations?: boolean;
  json?: boolean;
};

export async function roiCommand(opts: RoiCommandOpts, runtime: RuntimeEnv): Promise<void> {
  if (opts.listOccupations) {
    const occupations = listOccupations();
    if (opts.json) {
      const data = occupations.map((id) => ({
        id,
        title: getOccupationTitle(id),
        medianHourly: getHourlyWage(id),
      }));
      runtime.log(JSON.stringify(data, null, 2));
      return;
    }
    runtime.log("Available occupations:\n");
    for (const id of occupations) {
      const title = getOccupationTitle(id);
      const wage = getHourlyWage(id);
      runtime.log(`  ${id.padEnd(25)} ${title.padEnd(35)} $${wage.toFixed(2)}/hr`);
    }
    return;
  }

  if (!opts.hours) {
    runtime.error("--hours is required. Use --hours <n> to specify hours automated per month.");
    return;
  }

  const hours = Number(opts.hours);
  if (!Number.isFinite(hours) || hours < 0) {
    runtime.error("--hours must be a positive number.");
    return;
  }

  const apiCost = opts.apiCost ? Number(opts.apiCost) : 0;
  const infraCost = opts.infraCost ? Number(opts.infraCost) : 0;

  if (!Number.isFinite(apiCost) || apiCost < 0) {
    runtime.error("--api-cost must be a non-negative number.");
    return;
  }
  if (!Number.isFinite(infraCost) || infraCost < 0) {
    runtime.error("--infra-cost must be a non-negative number.");
    return;
  }

  const customRate = opts.rate ? Number(opts.rate) : undefined;
  if (customRate !== undefined && (!Number.isFinite(customRate) || customRate <= 0)) {
    runtime.error("--rate must be a positive number.");
    return;
  }

  // Default occupation if not provided and no custom rate
  const occupation = (opts.occupation ?? "software_developer") as OccupationId;
  if (!customRate) {
    const wage = getHourlyWage(occupation);
    if (wage === 0) {
      runtime.error(
        `Unknown occupation "${occupation}". Use --list-occupations to see available IDs.`,
      );
      return;
    }
  }

  const result = calculateROI({
    hoursAutomatedPerMonth: hours,
    occupation,
    monthlyApiCost: apiCost,
    monthlyInfraCost: infraCost,
    customHourlyRate: customRate,
  });

  if (opts.json) {
    runtime.log(JSON.stringify(result, null, 2));
    return;
  }

  runtime.log(formatROISummary(result));
}
