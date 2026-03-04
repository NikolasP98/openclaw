import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "web_fetch",
  factory: "createWebFetchTool",
  groups: ["group:web", "group:minion"],
  contextKeys: ["config", "sandboxed"],
  // No condition: factory returns null when unavailable; filtered by the registry loop.
};
