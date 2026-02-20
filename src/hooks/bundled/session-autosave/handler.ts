/**
 * Session auto-save hook handler
 *
 * Fires on message:sent events and appends a turn entry to a human-readable
 * session log file in memory/sessions/YYYY-MM-DD-{sessionKey}.md.
 *
 * The log is Markdown-formatted, append-only, and bounded at 500KB per file
 * (rolls to -part2, -part3, etc.).
 *
 * To enable, add to your config:
 * ```json
 * {
 *   "hooks": {
 *     "internal": {
 *       "enabled": true,
 *       "handlers": [
 *         {
 *           "event": "message:sent",
 *           "module": "bundled:session-autosave"
 *         }
 *       ]
 *     }
 *   }
 * }
 * ```
 *
 * Inspired by LocalClaw's session auto-save system.
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import type { MinionConfig } from "../../../config/config.js";
import { resolveStateDir } from "../../../config/paths.js";
import { createSubsystemLogger } from "../../../logging/subsystem.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import type { HookHandler } from "../../hooks.js";

const log = createSubsystemLogger("hooks/session-autosave");

const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500KB

/**
 * Sanitize a session key into a safe filename segment.
 */
function sanitizeSessionKey(key: string): string {
  return key
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

/**
 * Resolve the session log file path, rolling to partN if too large.
 */
async function resolveSessionLogPath(
  sessionsDir: string,
  dateStr: string,
  sessionSlug: string,
): Promise<string> {
  const baseName = `${dateStr}-${sessionSlug}`;
  let candidate = path.join(sessionsDir, `${baseName}.md`);
  let part = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.size < MAX_FILE_SIZE_BYTES) {
        return candidate;
      }
      // File too large, try next part
      part++;
      candidate = path.join(sessionsDir, `${baseName}-part${part}.md`);
    } catch {
      // File doesn't exist — use it
      return candidate;
    }
  }
}

/**
 * Format a turn entry as Markdown.
 */
function formatTurnEntry(params: {
  timestamp: Date;
  sessionKey: string;
  channelId: string;
  content: string;
  to: string;
}): string {
  const timeStr = params.timestamp.toISOString().split("T")[1].split(".")[0];
  const lines = [
    `## Turn at ${timeStr} UTC`,
    `**Channel**: ${params.channelId} | **To**: ${params.to}`,
    "",
    params.content.trim(),
    "",
    "---",
    "",
  ];
  return lines.join("\n");
}

/**
 * Auto-save turn to session log on every message:sent event.
 */
const autoSaveSession: HookHandler = async (event) => {
  if (event.type !== "message" || event.action !== "sent") {
    return;
  }

  const context = event.context || {};
  const content = (context.content as string) || "";
  const channelId = (context.channelId as string) || "unknown";
  const to = (context.to as string) || "unknown";
  const success = context.success as boolean;

  // Only log successful sends
  if (!success) {
    return;
  }

  // Skip empty content
  if (!content.trim()) {
    return;
  }

  try {
    const cfg = context.cfg as MinionConfig | undefined;
    const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
    const workspaceDir = cfg
      ? resolveAgentWorkspaceDir(cfg, agentId)
      : path.join(resolveStateDir(process.env, os.homedir()), "workspace");
    const sessionsDir = path.join(workspaceDir, "memory", "sessions");
    await fs.mkdir(sessionsDir, { recursive: true });

    const dateStr = event.timestamp.toISOString().slice(0, 10);
    const sessionSlug = sanitizeSessionKey(event.sessionKey);

    const logPath = await resolveSessionLogPath(sessionsDir, dateStr, sessionSlug);

    // If file is new, write header
    const isNew = !(await fs
      .access(logPath)
      .then(() => true)
      .catch(() => false));
    if (isNew) {
      const header = `# Session Log: ${event.sessionKey}\n\n`;
      await fs.writeFile(logPath, header, "utf-8");
    }

    // Append turn entry
    const entry = formatTurnEntry({
      timestamp: event.timestamp,
      sessionKey: event.sessionKey,
      channelId,
      content,
      to,
    });

    await fs.appendFile(logPath, entry, "utf-8");
    log.debug("Turn saved to session log", {
      path: logPath.replace(os.homedir(), "~"),
    });
  } catch (err) {
    log.error("Failed to auto-save session turn", {
      error: String(err),
    });
  }
};

export default autoSaveSession;
