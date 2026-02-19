import {
  readConfigFileSnapshot,
  validateConfigObjectWithPlugins,
  writeConfigFile,
} from "../../config/config.js";
import { logVerbose } from "../../globals.js";
import type { CommandHandler } from "./commands-types.js";

const OWNERS_CMD_RE = /^\/owners(?:\s|$)/i;

type OwnersSubcommand =
  | { action: "list" }
  | { action: "add"; peerId: string }
  | { action: "remove"; peerId: string }
  | { action: "error"; message: string };

function parseOwnersCommand(body: string): OwnersSubcommand | null {
  const normalized = body.trim();
  if (!OWNERS_CMD_RE.test(normalized)) {
    return null;
  }
  const rest = normalized.replace(/^\/owners\s*/i, "").trim();
  if (!rest) {
    return { action: "list" };
  }
  const [subcommand, ...argParts] = rest.split(/\s+/);
  const peerId = argParts.join(" ").trim();

  if (subcommand?.toLowerCase() === "add") {
    if (!peerId) {
      return { action: "error", message: "Usage: /owners add <peer-id>" };
    }
    return { action: "add", peerId };
  }

  if (subcommand?.toLowerCase() === "remove") {
    if (!peerId) {
      return { action: "error", message: "Usage: /owners remove <peer-id>" };
    }
    return { action: "remove", peerId };
  }

  return {
    action: "error",
    message: `Unknown /owners subcommand: "${subcommand}". Try: /owners, /owners add <peer-id>, /owners remove <peer-id>`,
  };
}

export const handleOwnersCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) {
    return null;
  }
  const parsed = parseOwnersCommand(params.command.commandBodyNormalized);
  if (!parsed) {
    return null;
  }

  const level = params.command.permissionLevel;
  if (level !== "owner" && level !== "admin") {
    logVerbose(
      `Ignoring /owners from non-owner sender: ${params.command.senderId || "<unknown>"} (level=${level})`,
    );
    return {
      shouldContinue: false,
      reply: { text: "⛔ /owners requires owner or admin access." },
    };
  }

  if (parsed.action === "error") {
    return {
      shouldContinue: false,
      reply: { text: `⚠️ ${parsed.message}` },
    };
  }

  const agentId = params.agentId;

  if (parsed.action === "list") {
    const agentConfig = agentId
      ? params.cfg.agents?.list?.find((a) => a.id === agentId)
      : undefined;
    const owners = agentConfig?.owners ?? [];
    if (owners.length === 0) {
      return {
        shouldContinue: false,
        reply: { text: `ℹ️ No owners configured for agent "${agentId ?? "default"}".` },
      };
    }
    return {
      shouldContinue: false,
      reply: {
        text: `Owners for agent "${agentId ?? "default"}":\n${owners.map((o) => `• ${o}`).join("\n")}`,
      },
    };
  }

  // add / remove — require admin or owner, write to config
  if (parsed.action === "remove" && level !== "admin") {
    return {
      shouldContinue: false,
      reply: { text: "⛔ /owners remove requires admin access." },
    };
  }

  if (!agentId) {
    return {
      shouldContinue: false,
      reply: { text: "⚠️ Cannot manage owners: no agent ID available for this session." },
    };
  }

  const snapshot = await readConfigFileSnapshot();
  if (!snapshot.valid || !snapshot.parsed || typeof snapshot.parsed !== "object") {
    return {
      shouldContinue: false,
      reply: { text: "⚠️ Config file is invalid; fix it before managing owners." },
    };
  }

  const parsedBase = structuredClone(snapshot.parsed as Record<string, unknown>);
  const agentsList = (parsedBase as { agents?: { list?: unknown[] } }).agents?.list;
  if (!Array.isArray(agentsList)) {
    return {
      shouldContinue: false,
      reply: { text: `⚠️ No agents.list found in config.` },
    };
  }

  const agentEntry = agentsList.find(
    (a): a is Record<string, unknown> =>
      typeof a === "object" && a !== null && (a as Record<string, unknown>).id === agentId,
  );
  if (!agentEntry) {
    return {
      shouldContinue: false,
      reply: { text: `⚠️ Agent "${agentId}" not found in config.` },
    };
  }

  const currentOwners: string[] = Array.isArray(agentEntry.owners)
    ? (agentEntry.owners as string[]).map(String)
    : [];

  if (parsed.action === "add") {
    if (currentOwners.includes(parsed.peerId)) {
      return {
        shouldContinue: false,
        reply: { text: `ℹ️ "${parsed.peerId}" is already an owner of agent "${agentId}".` },
      };
    }
    agentEntry.owners = [...currentOwners, parsed.peerId];
  } else {
    // remove
    if (!currentOwners.includes(parsed.peerId)) {
      return {
        shouldContinue: false,
        reply: {
          text: `ℹ️ "${parsed.peerId}" is not an owner of agent "${agentId}".`,
        },
      };
    }
    agentEntry.owners = currentOwners.filter((o) => o !== parsed.peerId);
  }

  const validated = validateConfigObjectWithPlugins(parsedBase);
  if (!validated.ok) {
    const issue = validated.issues[0];
    return {
      shouldContinue: false,
      reply: {
        text: `⚠️ Config invalid after owners update (${issue.path}: ${issue.message}).`,
      },
    };
  }

  await writeConfigFile(validated.config);

  const actionLabel = parsed.action === "add" ? "added to" : "removed from";
  return {
    shouldContinue: false,
    reply: {
      text: `✅ "${parsed.peerId}" ${actionLabel} owners of agent "${agentId}".`,
    },
  };
};
