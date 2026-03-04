import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "sessions_send",
  factory: "createSessionsSendTool",
  groups: ["group:sessions", "group:minion"],
  contextKeys: ["agentSessionKey", "agentChannel", "sandboxed"],
};
