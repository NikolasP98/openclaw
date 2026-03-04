import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "architect_pipeline",
  factory: "createArchitectPipelineTool",
  groups: ["group:minion"],
  contextKeys: ["workspaceDir"],
};
