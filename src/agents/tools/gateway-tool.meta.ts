import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "gateway",
  factory: "createGatewayTool",
  groups: ["group:automation", "group:minion"],
  contextKeys: ["agentSessionKey", "config"],
};
