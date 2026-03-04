import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "summarize",
  factory: "createSummarizeTool",
  groups: [],
  requires: { bins: ["summarize"] },
  mcpExport: true,
  skillPromptFile: "./summarize-tool.skill.md",
};
