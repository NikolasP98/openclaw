import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "gog_exec",
  factory: "createGogExecTool",
  groups: ["group:gog", "group:minion"],
  contextKeys: ["agentId", "agentSessionKey"],
  condition: "gogOAuthEnabled",
};
