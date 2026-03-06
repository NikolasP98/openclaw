import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "knowledge_graph",
  factory: "createKnowledgeGraphTools",
  groups: ["group:memory", "group:minion"],
  multi: true,
  modulePath: "../../memory/knowledge-graph.js",
};
