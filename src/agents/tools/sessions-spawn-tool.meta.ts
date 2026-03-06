import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "sessions_spawn",
  factory: "createSessionsSpawnTool",
  groups: ["group:sessions", "group:minion"],
  contextKeys: [
    "agentSessionKey",
    "agentChannel",
    "agentAccountId",
    "agentTo",
    "agentThreadId",
    "agentGroupId",
    "agentGroupChannel",
    "agentGroupSpace",
    "sandboxed",
    "requesterAgentIdOverride",
  ],
};
