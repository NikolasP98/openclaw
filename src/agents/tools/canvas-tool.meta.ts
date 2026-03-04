import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "canvas",
  factory: "createCanvasTool",
  groups: ["group:ui", "group:minion"],
  contextKeys: ["config"],
};
