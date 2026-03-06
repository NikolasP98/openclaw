import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "gog_auth_revoke",
  factory: "createGogAuthRevokeTool",
  groups: ["group:gog", "group:minion"],
  contextKeys: ["agentId", "agentDir", "agentSessionKey"],
  condition: "gogOAuthEnabled",
};
