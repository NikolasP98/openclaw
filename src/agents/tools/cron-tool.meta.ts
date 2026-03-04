import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "cron",
  factory: "createCronTool",
  groups: ["group:automation", "group:minion"],
  contextKeys: ["agentSessionKey"],
};
