import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "architect_pipeline",
  factory: "createArchitectPipelineTool",
  groups: [],
  contextKeys: ["workspaceDir"],
};
