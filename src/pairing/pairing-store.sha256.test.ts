import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveOAuthDir } from "../config/paths.js";
import { captureEnv } from "../test-support/env.js";
import {
  approveChannelPairingCode,
  listChannelPairingRequests,
  upsertChannelPairingRequest,
} from "./pairing-store.js";
import { isHashedToken } from "./token-hash.js";

let fixtureRoot = "";
let caseId = 0;

beforeAll(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-pairing-sha256-"));
});

afterAll(async () => {
  if (fixtureRoot) {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

async function withTempStateDir<T>(fn: (stateDir: string) => Promise<T>) {
  const envSnapshot = captureEnv(["OPENCLAW_STATE_DIR"]);
  const dir = path.join(fixtureRoot, `case-${caseId++}`);
  await fs.mkdir(dir, { recursive: true });
  process.env.OPENCLAW_STATE_DIR = dir;
  try {
    return await fn(dir);
  } finally {
    envSnapshot.restore();
  }
}

describe("pairing store — SHA-256 token hashing", () => {
  it("stores code as SHA-256 hash, never as raw plaintext", async () => {
    await withTempStateDir(async (stateDir) => {
      const { code } = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "u1",
      });
      // Returned code is a valid 8-char plaintext pairing code.
      expect(code).toMatch(/^[A-Z2-9]{8}$/);

      // On-disk representation is a SHA-256 hash.
      const oauthDir = resolveOAuthDir(process.env, stateDir);
      const filePath = path.join(oauthDir, "telegram-pairing.json");
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as { requests?: Array<{ code?: string }> };
      const storedCode = parsed.requests?.[0]?.code ?? "";

      expect(storedCode).not.toBe(code);
      expect(isHashedToken(storedCode)).toBe(true);
    });
  });

  it("accepts a valid plaintext code at approval time", async () => {
    await withTempStateDir(async () => {
      const { code } = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "u2",
      });
      const approved = await approveChannelPairingCode({
        channel: "telegram",
        code,
      });
      expect(approved?.id).toBe("u2");
    });
  });

  it("rejects a tampered/wrong code at approval time", async () => {
    await withTempStateDir(async () => {
      await upsertChannelPairingRequest({
        channel: "telegram",
        id: "u3",
      });
      // Use a wrong code.
      const approved = await approveChannelPairingCode({
        channel: "telegram",
        code: "ZZZZZZZZ",
      });
      expect(approved).toBeNull();
    });
  });

  it("accepts legacy plaintext codes (migration on first use)", async () => {
    await withTempStateDir(async (stateDir) => {
      // Simulate a legacy store with a plaintext code on disk.
      const oauthDir = resolveOAuthDir(process.env, stateDir);
      await fs.mkdir(oauthDir, { recursive: true });
      const filePath = path.join(oauthDir, "telegram-pairing.json");
      const legacyEntry = {
        id: "u4",
        code: "ABCD1234",
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      };
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: 1, requests: [legacyEntry] }, null, 2) + "\n",
        "utf8",
      );

      // Approving with the plaintext code should work (migration path).
      const approved = await approveChannelPairingCode({
        channel: "telegram",
        code: "ABCD1234",
      });
      expect(approved?.id).toBe("u4");
    });
  });

  it("list returns hashed codes, not plaintext", async () => {
    await withTempStateDir(async () => {
      const { code: plaintext } = await upsertChannelPairingRequest({
        channel: "discord",
        id: "u5",
      });

      const list = await listChannelPairingRequests("discord");
      expect(list).toHaveLength(1);
      const storedCode = list[0]?.code ?? "";
      // Listed code is a hash, not the plaintext code shown to user.
      expect(storedCode).not.toBe(plaintext);
      expect(isHashedToken(storedCode)).toBe(true);
    });
  });
});
