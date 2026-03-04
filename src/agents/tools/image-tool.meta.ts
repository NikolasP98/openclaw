import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "image",
  factory: "createImageTool",
  groups: ["group:minion"],
  contextKeys: [
    "config",
    "agentDir",
    "workspaceDir",
    "sandboxRoot",
    "sandboxFsBridge",
    "modelHasVision",
  ],
  condition: "hasAgentDir",
};
