import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "tts",
  factory: "createTtsTool",
  groups: [],
  contextKeys: ["agentChannel", "config"],
};
