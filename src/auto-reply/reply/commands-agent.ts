import { logVerbose } from "../../globals.js";
import type { CommandHandler } from "./commands-types.js";

const AGENT_CMD_RE = /^\/agent(?:\s|$)/i;

export const handleAgentCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  if (!AGENT_CMD_RE.test(params.command.commandBodyNormalized)) {
    return null;
  }

  if (params.command.permissionLevel !== "admin") {
    logVerbose(
      `Ignoring /agent from non-admin sender: ${params.command.senderId || "<unknown>"} (level=${params.command.permissionLevel})`,
    );
    return {
      shouldContinue: false,
      reply: { text: "⛔ /agent requires admin access." },
    };
  }

  const arg = params.command.commandBodyNormalized.replace(/^\/agent\s*/i, "").trim();

  if (!arg) {
    // List available agents
    const agents = params.cfg.agents?.list ?? [];
    if (agents.length === 0) {
      return {
        shouldContinue: false,
        reply: { text: "ℹ️ No agents configured." },
      };
    }
    const currentAgentId = params.agentId ?? "(default)";
    const lines = agents.map((a) => {
      const marker = a.id === currentAgentId ? " ◀ current" : "";
      return `• ${a.id}${a.name ? ` — ${a.name}` : ""}${marker}`;
    });
    return {
      shouldContinue: false,
      reply: { text: `Available agents:\n${lines.join("\n")}` },
    };
  }

  // Switch to named agent
  const targetAgent = params.cfg.agents?.list?.find((a) => a.id === arg);
  if (!targetAgent) {
    const available = (params.cfg.agents?.list ?? []).map((a) => a.id).join(", ");
    return {
      shouldContinue: false,
      reply: {
        text: `⚠️ Agent "${arg}" not found.${available ? ` Available: ${available}` : ""}`,
      },
    };
  }

  // Store the agent override in the session entry if a store is available
  if (params.sessionEntry) {
    // oxlint-disable-next-line typescript/no-explicit-any
    (params.sessionEntry as any).overrideAgentId = arg;
  }

  return {
    shouldContinue: false,
    reply: {
      text: `✅ Switched to agent: ${arg}${targetAgent.name ? ` (${targetAgent.name})` : ""}.`,
    },
  };
};
