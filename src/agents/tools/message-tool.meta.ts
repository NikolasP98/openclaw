import type { ToolMeta } from "../tool-meta.js";
export const meta: ToolMeta = {
  id: "message",
  factory: "createMessageTool",
  groups: ["group:messaging", "group:minion"],
  contextKeys: [
    "agentAccountId",
    "agentSessionKey",
    "config",
    "currentChannelId",
    "agentChannel",
    "currentThreadTs",
    "replyToMode",
    "hasRepliedRef",
    "sandboxRoot",
    "requireExplicitMessageTarget",
  ],
  condition: "messageEnabled",
};
