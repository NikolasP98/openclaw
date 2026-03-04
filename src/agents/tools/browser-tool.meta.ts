import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "browser",
  factory: "createBrowserTool",
  groups: ["group:ui", "group:minion"],
  contextKeys: ["sandboxBrowserBridgeUrl", "allowHostBrowserControl"],
};
