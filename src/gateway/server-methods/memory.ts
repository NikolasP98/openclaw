import { KnowledgeGraphSession } from "../../memory/knowledge-graph.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const memoryHandlers: GatewayRequestHandlers = {
  "memory.snapshot": async ({ respond, params }) => {
    const agentId = typeof params?.agentId === "string" ? params.agentId : null;
    if (!agentId) {
      return respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "agentId required"));
    }
    try {
      const session = KnowledgeGraphSession.forAgent(agentId);
      const nodes = session.listAll();
      const edges = session.listAllRelationships();
      respond(true, { nodes, edges });
    } catch (e) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(e)));
    }
  },
};
