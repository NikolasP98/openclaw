/**
 * WhatsApp group management — per-group memory and metadata sync.
 *
 * - Per-group memory isolation: each group gets its own CLAUDE.md
 * - Daily group metadata sync: fetch all group names/participants on startup
 *
 * Inspired by NanoClaw's WhatsApp-native per-group memory pattern.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("channels/whatsapp-groups");

// ── Types ────────────────────────────────────────────────────────────

export interface GroupMetadata {
  jid: string;
  name: string;
  participantCount: number;
  description?: string;
  /** Last time metadata was refreshed. */
  refreshedAt: number;
}

// ── Per-Group Memory Isolation (S10.5) ───────────────────────────────

const GROUP_MEMORY_FILENAME = "CLAUDE.md";

/**
 * Resolve the path to a group's memory file.
 *
 * @param workspaceDir - Agent workspace root (e.g. ~/.minion/)
 * @param groupJid - WhatsApp group JID (e.g. "123456@g.us")
 * @returns Path to the group's CLAUDE.md file
 */
export function resolveGroupMemoryPath(workspaceDir: string, groupJid: string): string {
  const sanitized = sanitizeJidForPath(groupJid);
  return path.join(workspaceDir, "groups", sanitized, GROUP_MEMORY_FILENAME);
}

/**
 * Read a group's memory file. Returns undefined if it doesn't exist.
 */
export async function readGroupMemory(
  workspaceDir: string,
  groupJid: string,
): Promise<string | undefined> {
  const filePath = resolveGroupMemoryPath(workspaceDir, groupJid);
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return undefined;
  }
}

/**
 * Write to a group's memory file. Creates the directory structure if needed.
 */
export async function writeGroupMemory(
  workspaceDir: string,
  groupJid: string,
  content: string,
): Promise<void> {
  const filePath = resolveGroupMemoryPath(workspaceDir, groupJid);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
  log.debug(`Wrote group memory for ${groupJid} (${content.length} chars)`);
}

/**
 * List all groups that have memory files.
 */
export async function listGroupsWithMemory(workspaceDir: string): Promise<string[]> {
  const groupsDir = path.join(workspaceDir, "groups");
  try {
    const entries = await fs.readdir(groupsDir, { withFileTypes: true });
    const groups: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const memPath = path.join(groupsDir, entry.name, GROUP_MEMORY_FILENAME);
        try {
          await fs.access(memPath);
          groups.push(entry.name);
        } catch {
          // No memory file for this group.
        }
      }
    }
    return groups;
  } catch {
    return [];
  }
}

// ── Group Metadata Sync (S10.6) ──────────────────────────────────────

/**
 * In-memory store for group metadata. Populated on startup and
 * refreshed every 24 hours.
 */
const groupMetadataStore = new Map<string, GroupMetadata>();

/** Store group metadata. */
export function setGroupMetadata(metadata: GroupMetadata): void {
  groupMetadataStore.set(metadata.jid, metadata);
}

/** Get metadata for a specific group. */
export function getGroupMetadata(jid: string): GroupMetadata | undefined {
  return groupMetadataStore.get(jid);
}

/** Get all known group metadata. */
export function getAllGroupMetadata(): GroupMetadata[] {
  return [...groupMetadataStore.values()];
}

/** Get group name by JID (returns JID if name unknown). */
export function getGroupName(jid: string): string {
  return groupMetadataStore.get(jid)?.name ?? jid;
}

/** Clear all metadata (for testing). */
export function clearGroupMetadata(): void {
  groupMetadataStore.clear();
}

/**
 * Sync group metadata from a Baileys-like fetch function.
 *
 * Call this on gateway startup and schedule a 24h refresh via cron.
 *
 * @param fetchFn - A function like `sock.groupFetchAllParticipating()`
 *                  that returns a Record<string, GroupInfo>
 */
export async function syncGroupMetadata(
  fetchFn: () => Promise<Record<string, { subject: string; participants: Array<unknown>; desc?: string }>>,
): Promise<number> {
  try {
    const groups = await fetchFn();
    let count = 0;
    for (const [jid, info] of Object.entries(groups)) {
      setGroupMetadata({
        jid,
        name: info.subject,
        participantCount: info.participants?.length ?? 0,
        description: info.desc,
        refreshedAt: Date.now(),
      });
      count++;
    }
    log.debug(`Group metadata synced: ${count} groups`);
    return count;
  } catch (err) {
    log.warn(`Group metadata sync failed: ${err}`);
    return 0;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Sanitize a WhatsApp JID for use as a directory name.
 * Strips special chars, keeps it filesystem-safe.
 */
function sanitizeJidForPath(jid: string): string {
  return jid.replace(/@/g, "_at_").replace(/[^a-zA-Z0-9_.-]/g, "_");
}
