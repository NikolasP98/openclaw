import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "session_status",
  factory: "createSessionStatusTool",
  groups: ["group:sessions", "group:minion"],
  contextKeys: ["agentSessionKey", "config"],
};
