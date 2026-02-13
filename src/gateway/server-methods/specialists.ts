import type { GatewayRequestHandlers } from "./types.js";
import { getAllSpecialistMetrics } from "../../agents/specialist-tracker.js";

/**
 * Gateway handlers for specialist metrics and load balancing.
 */
export const specialistsHandlers: GatewayRequestHandlers = {
  /**
   * Get current workload and performance metrics for all specialists.
   * Useful for monitoring dashboards and debugging delegation issues.
   */
  "specialists.status": ({ respond }) => {
    const metrics = getAllSpecialistMetrics();

    // Sort by agentId for consistent ordering
    const sorted = metrics.toSorted((a, b) => a.agentId.localeCompare(b.agentId));

    respond(true, { specialists: sorted }, undefined);
  },
};
