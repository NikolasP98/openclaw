import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "nodes",
  factory: "createNodesTool",
  groups: ["group:nodes", "group:minion"],
  contextKeys: ["agentSessionKey", "config"],
};
