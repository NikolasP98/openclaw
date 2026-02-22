import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearGroupMetadata,
  getAllGroupMetadata,
  getGroupMetadata,
  getGroupName,
  listGroupsWithMemory,
  readGroupMemory,
  resolveGroupMemoryPath,
  setGroupMetadata,
  syncGroupMetadata,
  writeGroupMemory,
} from "./whatsapp-groups.js";

describe("whatsapp-groups", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-groups-test-"));
    clearGroupMetadata();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("per-group memory", () => {
    it("resolves group memory path with sanitized JID", () => {
      const p = resolveGroupMemoryPath(tmpDir, "123456@g.us");
      expect(p).toContain("groups");
      expect(p).toContain("CLAUDE.md");
      expect(p).not.toContain("@"); // JID sanitized for filesystem.
    });

    it("writes and reads group memory", async () => {
      await writeGroupMemory(tmpDir, "group1@g.us", "Group 1 context");
      const content = await readGroupMemory(tmpDir, "group1@g.us");
      expect(content).toBe("Group 1 context");
    });

    it("returns undefined for non-existent group memory", async () => {
      const content = await readGroupMemory(tmpDir, "nonexistent@g.us");
      expect(content).toBeUndefined();
    });

    it("lists groups with memory files", async () => {
      await writeGroupMemory(tmpDir, "group1@g.us", "ctx1");
      await writeGroupMemory(tmpDir, "group2@g.us", "ctx2");
      const groups = await listGroupsWithMemory(tmpDir);
      expect(groups).toHaveLength(2);
    });

    it("returns empty list when no groups directory", async () => {
      const groups = await listGroupsWithMemory(tmpDir);
      expect(groups).toHaveLength(0);
    });
  });

  describe("group metadata sync", () => {
    it("stores and retrieves metadata", () => {
      setGroupMetadata({ jid: "test@g.us", name: "Test Group", participantCount: 5, refreshedAt: Date.now() });
      const meta = getGroupMetadata("test@g.us");
      expect(meta?.name).toBe("Test Group");
      expect(meta?.participantCount).toBe(5);
    });

    it("getGroupName returns JID when name unknown", () => {
      expect(getGroupName("unknown@g.us")).toBe("unknown@g.us");
    });

    it("getGroupName returns name when known", () => {
      setGroupMetadata({ jid: "known@g.us", name: "My Group", participantCount: 3, refreshedAt: Date.now() });
      expect(getGroupName("known@g.us")).toBe("My Group");
    });

    it("syncs from fetch function", async () => {
      const mockFetch = async () => ({
        "group1@g.us": { subject: "Engineering", participants: [1, 2, 3], desc: "Dev team" },
        "group2@g.us": { subject: "Marketing", participants: [4, 5] },
      });

      const count = await syncGroupMetadata(mockFetch);
      expect(count).toBe(2);
      expect(getAllGroupMetadata()).toHaveLength(2);
      expect(getGroupMetadata("group1@g.us")?.name).toBe("Engineering");
      expect(getGroupMetadata("group1@g.us")?.participantCount).toBe(3);
    });

    it("handles sync failure gracefully", async () => {
      const mockFetch = async () => { throw new Error("network"); };
      const count = await syncGroupMetadata(mockFetch as () => Promise<Record<string, { subject: string; participants: unknown[]; desc?: string }>>);
      expect(count).toBe(0);
    });

    it("clears metadata", () => {
      setGroupMetadata({ jid: "a@g.us", name: "A", participantCount: 1, refreshedAt: Date.now() });
      clearGroupMetadata();
      expect(getAllGroupMetadata()).toHaveLength(0);
    });
  });
});
