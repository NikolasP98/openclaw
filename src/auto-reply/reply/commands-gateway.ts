import { callGateway } from "../../gateway/call.js";
import { logVerbose } from "../../globals.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../../shared/message-channel.js";
import { VERSION } from "../../version.js";
import type { CommandHandler } from "./commands-types.js";

const GATEWAY_CMD_RE = /^\/gateway(?:\s|$)/i;

const USAGE = "/gateway <subcommand>\nSubcommands: status | health | sessions | version";

export const handleGatewayCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  if (!GATEWAY_CMD_RE.test(params.command.commandBodyNormalized)) {
    return null;
  }

  if (params.command.permissionLevel !== "admin") {
    logVerbose(
      `Ignoring /gateway from non-admin sender: ${params.command.senderId || "<unknown>"} (level=${params.command.permissionLevel})`,
    );
    return {
      shouldContinue: false,
      reply: { text: "⛔ /gateway requires admin access." },
    };
  }

  const sub = params.command.commandBodyNormalized.replace(/^\/gateway\s*/i, "").trim();

  if (!sub) {
    return { shouldContinue: false, reply: { text: USAGE } };
  }

  if (sub === "version") {
    return { shouldContinue: false, reply: { text: `Version: ${VERSION}` } };
  }

  if (sub === "status") {
    let result: unknown;
    try {
      result = await callGateway({
        method: "status",
        clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
        mode: GATEWAY_CLIENT_MODES.BACKEND,
      });
    } catch (err) {
      return {
        shouldContinue: false,
        reply: { text: `❌ Gateway unreachable: ${String(err)}` },
      };
    }
    const data = result as Record<string, unknown> | null;
    if (!data) {
      return { shouldContinue: false, reply: { text: "No status data returned." } };
    }
    const lines = ["📡 Gateway Status"];
    if (data.channels != null) {
      lines.push(`Channels: ${JSON.stringify(data.channels)}`);
    }
    if (data.sessions != null) {
      lines.push(`Sessions: ${JSON.stringify(data.sessions)}`);
    }
    if (data.uptime != null) {
      lines.push(`Uptime: ${JSON.stringify(data.uptime)}`);
    }
    if (lines.length === 1) {
      lines.push(JSON.stringify(data, null, 2));
    }
    return { shouldContinue: false, reply: { text: lines.join("\n") } };
  }

  if (sub === "health") {
    let result: unknown;
    try {
      result = await callGateway({
        method: "health",
        clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
        mode: GATEWAY_CLIENT_MODES.BACKEND,
      });
    } catch (err) {
      return {
        shouldContinue: false,
        reply: { text: `❌ Gateway unreachable: ${String(err)}` },
      };
    }
    const data = result as Record<string, unknown> | null;
    if (!data) {
      return { shouldContinue: false, reply: { text: "No health data returned." } };
    }
    const lines = ["🩺 Gateway Health"];
    if (data.channels != null) {
      lines.push(`Channels: ${JSON.stringify(data.channels)}`);
    }
    if (data.agents != null) {
      lines.push(`Agents: ${JSON.stringify(data.agents)}`);
    }
    if (data.ok != null) {
      lines.push(`OK: ${JSON.stringify(data.ok)}`);
    }
    if (lines.length === 1) {
      lines.push(JSON.stringify(data, null, 2));
    }
    return { shouldContinue: false, reply: { text: lines.join("\n") } };
  }

  if (sub === "sessions") {
    let result: unknown;
    try {
      result = await callGateway({
        method: "sessions.list",
        clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
        mode: GATEWAY_CLIENT_MODES.BACKEND,
      });
    } catch (err) {
      return {
        shouldContinue: false,
        reply: { text: `❌ Gateway unreachable: ${String(err)}` },
      };
    }
    const sessions = result as Array<{ key?: string; age?: number; createdAt?: string }> | null;
    if (!sessions || sessions.length === 0) {
      return { shouldContinue: false, reply: { text: "No active sessions." } };
    }
    const lines = [`🗂️ Sessions (${sessions.length})`];
    for (const s of sessions) {
      const age = s.age != null ? ` (${s.age}s)` : s.createdAt ? ` (since ${s.createdAt})` : "";
      lines.push(`  ${s.key ?? JSON.stringify(s)}${age}`);
    }
    return { shouldContinue: false, reply: { text: lines.join("\n") } };
  }

  return {
    shouldContinue: false,
    reply: { text: `Unknown subcommand: ${sub}\n${USAGE}` },
  };
};
