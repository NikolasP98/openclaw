import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "gog_auth_start",
  factory: "createGogAuthStartTool",
  groups: [],
  contextKeys: ["agentId", "agentDir", "agentSessionKey"],
  condition: "gogOAuthEnabled",
};
