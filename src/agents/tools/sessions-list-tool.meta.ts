import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "sessions_list",
  factory: "createSessionsListTool",
  groups: ["group:sessions", "group:minion"],
  contextKeys: ["agentSessionKey", "sandboxed"],
};
