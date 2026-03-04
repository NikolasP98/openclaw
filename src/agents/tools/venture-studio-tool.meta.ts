import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "venture_studio",
  factory: "createVentureStudioTool",
  groups: ["group:minion"],
  contextKeys: ["workspaceDir"],
};
