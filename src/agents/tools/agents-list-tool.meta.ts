import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "agents_list",
  factory: "createAgentsListTool",
  groups: ["group:minion"],
  contextKeys: ["agentSessionKey", "requesterAgentIdOverride"],
};
