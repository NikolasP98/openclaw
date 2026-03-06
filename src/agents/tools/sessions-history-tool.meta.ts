import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "sessions_history",
  factory: "createSessionsHistoryTool",
  groups: ["group:sessions", "group:minion"],
  contextKeys: ["agentSessionKey", "sandboxed"],
};
