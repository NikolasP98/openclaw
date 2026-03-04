import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "gog_exec",
  factory: "createGogExecTool",
  groups: [],
  contextKeys: ["agentId", "agentSessionKey"],
  condition: "gogOAuthEnabled",
};
