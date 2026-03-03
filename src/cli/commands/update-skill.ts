/**
 * `/update` self-upgrade skill — conversational wrapper around the update system.
 *
 * Provides an agent-callable interface for checking updates, previewing changes,
 * and performing self-upgrades. Wraps the existing update-cli infrastructure.
 *
 * @module
 */

import { readPackageVersion, resolveUpdateRoot } from "../../cli/update-cli/shared.js";
import { readConfigFileSnapshot, writeConfigFile } from "../../config/config.js";
import { normalizeUpdateChannel } from "../../infra/update-channels.js";
import { logInfo, logError } from "../../logger.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type UpdateSkillAction = "check" | "execute" | "set-channel";

export type UpdateSkillParams = {
  action: UpdateSkillAction;
  channel?: string;
  confirmed?: boolean;
};

export type UpdateSkillResult = {
  success: boolean;
  currentVersion: string;
  channel: string;
  message: string;
};

// ── Check for updates ────────────────────────────────────────────────────────

async function resolveCurrentState(): Promise<{
  currentVersion: string;
  channel: string;
}> {
  const root = await resolveUpdateRoot();
  const currentVersion = (await readPackageVersion(root)) ?? "unknown";
  const configSnapshot = await readConfigFileSnapshot();
  const channel = normalizeUpdateChannel(configSnapshot.config.update?.channel) ?? "stable";
  return { currentVersion, channel };
}

export async function checkForUpdates(): Promise<UpdateSkillResult> {
  const { currentVersion, channel } = await resolveCurrentState();
  return {
    success: true,
    currentVersion,
    channel,
    message: `Current version: ${currentVersion}, channel: ${channel}. Use the CLI \`openclaw update\` for full update flow with diff preview.`,
  };
}

// ── Set update channel ───────────────────────────────────────────────────────

export async function setUpdateChannel(rawChannel: string): Promise<UpdateSkillResult> {
  const { currentVersion } = await resolveCurrentState();
  const normalized = normalizeUpdateChannel(rawChannel) ?? "stable";
  try {
    const configSnapshot = await readConfigFileSnapshot();
    const config = { ...configSnapshot.config };
    config.update = { ...config.update, channel: normalized };
    await writeConfigFile(config);
    logInfo(`Update channel set to "${normalized}"`);
    return {
      success: true,
      currentVersion,
      channel: normalized,
      message: `Update channel set to "${normalized}". Run \`openclaw update\` to apply.`,
    };
  } catch (err) {
    logError(`Failed to set update channel: ${String(err)}`);
    return {
      success: false,
      currentVersion,
      channel: normalized,
      message: `Failed to set update channel: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Skill dispatch ───────────────────────────────────────────────────────────

/**
 * Main entry point for the /update skill.
 *
 * Note: Actual update execution is intentionally delegated to the CLI
 * (`openclaw update`) which handles interactive confirmation, diff preview,
 * gateway restart, and shell completion refresh. The skill provides
 * check and channel management only.
 */
export async function updateSkill(params: UpdateSkillParams): Promise<UpdateSkillResult> {
  switch (params.action) {
    case "check":
      return checkForUpdates();
    case "set-channel":
      return setUpdateChannel(params.channel ?? "stable");
    case "execute": {
      const { currentVersion, channel } = await resolveCurrentState();
      return {
        success: false,
        currentVersion,
        channel,
        message:
          "Self-update must be run from the CLI for safety: `openclaw update`. " +
          "This ensures proper diff preview, confirmation, gateway restart, and rollback.",
      };
    }
    default:
      return {
        success: false,
        currentVersion: "unknown",
        channel: "stable",
        message: `Unknown action: ${String(params.action)}. Use "check", "execute", or "set-channel".`,
      };
  }
}
