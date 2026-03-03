import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  approveDevicePairing,
  getPairedDevice,
  removePairedDevice,
  requestDevicePairing,
  rotateDeviceToken,
  verifyDeviceToken,
} from "./device-pairing.js";
import { isHashedToken } from "./pairing-token.js";

async function setupPairedOperatorDevice(baseDir: string, scopes: string[]) {
  const request = await requestDevicePairing(
    {
      deviceId: "device-1",
      publicKey: "public-key-1",
      role: "operator",
      scopes,
    },
    baseDir,
  );
  const approval = await approveDevicePairing(request.request.requestId, baseDir);
  return { approval };
}

function requireToken(token: string | undefined): string {
  expect(typeof token).toBe("string");
  if (typeof token !== "string") {
    throw new Error("expected operator token to be issued");
  }
  return token;
}

describe("device pairing tokens", () => {
  test("stores SHA-256 hashed tokens at rest (not plaintext)", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "minion-device-pairing-"));
    await setupPairedOperatorDevice(baseDir, ["operator.admin"]);

    const paired = await getPairedDevice("device-1", baseDir);
    const storedToken = requireToken(paired?.tokens?.operator?.token);
    // Token at rest should be SHA-256 hash, not plaintext
    expect(isHashedToken(storedToken)).toBe(true);
    expect(storedToken).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("preserves existing token scopes when rotating without scopes", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "minion-device-pairing-"));
    await setupPairedOperatorDevice(baseDir, ["operator.admin"]);

    await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      scopes: ["operator.read"],
      baseDir,
    });
    let paired = await getPairedDevice("device-1", baseDir);
    expect(paired?.tokens?.operator?.scopes).toEqual(["operator.read"]);
    expect(paired?.scopes).toEqual(["operator.read"]);

    await rotateDeviceToken({
      deviceId: "device-1",
      role: "operator",
      baseDir,
    });
    paired = await getPairedDevice("device-1", baseDir);
    expect(paired?.tokens?.operator?.scopes).toEqual(["operator.read"]);
  });

  test("verifies token using plaintext and rejects mismatches", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "minion-device-pairing-"));
    const { approval } = await setupPairedOperatorDevice(baseDir, ["operator.read"]);
    // Use the plaintext token returned from approval (not the stored hash)
    const plaintextToken = approval?.plaintextTokens?.operator;
    expect(plaintextToken).toBeTruthy();

    const ok = await verifyDeviceToken({
      deviceId: "device-1",
      token: plaintextToken!,
      role: "operator",
      scopes: ["operator.read"],
      baseDir,
    });
    expect(ok.ok).toBe(true);

    const mismatch = await verifyDeviceToken({
      deviceId: "device-1",
      token: "wrong-token-value",
      role: "operator",
      scopes: ["operator.read"],
      baseDir,
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reason).toBe("token-mismatch");
  });

  test("treats multibyte same-length token input as mismatch without throwing", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "minion-device-pairing-"));
    const { approval } = await setupPairedOperatorDevice(baseDir, ["operator.read"]);
    const plaintextToken = approval?.plaintextTokens?.operator;
    expect(plaintextToken).toBeTruthy();
    const multibyteToken = "é".repeat(plaintextToken!.length);
    expect(Buffer.from(multibyteToken).length).not.toBe(Buffer.from(plaintextToken!).length);

    await expect(
      verifyDeviceToken({
        deviceId: "device-1",
        token: multibyteToken,
        role: "operator",
        scopes: ["operator.read"],
        baseDir,
      }),
    ).resolves.toEqual({ ok: false, reason: "token-mismatch" });
  });

  test("removes paired devices by device id", async () => {
    const baseDir = await mkdtemp(join(tmpdir(), "openclaw-device-pairing-"));
    await setupPairedOperatorDevice(baseDir, ["operator.read"]);

    const removed = await removePairedDevice("device-1", baseDir);
    expect(removed).toEqual({ deviceId: "device-1" });
    await expect(getPairedDevice("device-1", baseDir)).resolves.toBeNull();

    await expect(removePairedDevice("device-1", baseDir)).resolves.toBeNull();
  });
});
