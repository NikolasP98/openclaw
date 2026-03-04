import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "summarize",
  factory: "createSummarizeTool",
  groups: ["group:minion"],
  requires: { bins: ["summarize"] },
  mcpExport: true,
  skillPromptFile: "./summarize-tool.skill.md",
};
