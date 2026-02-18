import type { GatewayRequestHandlers } from "./types.js";
import { reliabilityBuffer, getReliabilityUptimeStartMs } from "../../logging/reliability.js";

export const reliabilityHandlers: GatewayRequestHandlers = {
  "reliability.events": ({ params, respond }) => {
    const typed = params as {
      category?: string;
      since?: number;
      limit?: number;
    };

    const events = reliabilityBuffer.query({
      category: typeof typed.category === "string" ? typed.category : undefined,
      since: typeof typed.since === "number" ? typed.since : undefined,
      limit: typeof typed.limit === "number" ? Math.min(typed.limit, 1000) : 200,
    });

    respond(true, { events });
  },

  "reliability.summary": ({ respond }) => {
    const summary = reliabilityBuffer.summary();
    respond(true, {
      uptimeSinceMs: getReliabilityUptimeStartMs(),
      ...summary,
    });
  },
};
