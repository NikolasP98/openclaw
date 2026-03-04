import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "subagents",
  factory: "createSubagentsTool",
  groups: ["group:sessions", "group:minion"],
  contextKeys: ["agentSessionKey"],
};
