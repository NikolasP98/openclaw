import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "gog_auth_status",
  factory: "createGogAuthStatusTool",
  groups: [],
  contextKeys: ["agentId", "agentSessionKey"],
  condition: "gogOAuthEnabled",
};
