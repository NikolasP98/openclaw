import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertRealPathInWorkspace, isRealPathInside } from "./scan-paths.js";

const isWindows = process.platform === "win32";

describe("symlink workspace escape guard", () => {
  let tmpDir: string;
  let workspace: string;

  beforeAll(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "scan-paths-test-"));
    workspace = path.join(tmpDir, "workspace");
    await fsp.mkdir(workspace, { recursive: true });
    await fsp.writeFile(path.join(workspace, "safe.txt"), "hello");
    // Create a directory outside workspace.
    await fsp.mkdir(path.join(tmpDir, "outside"), { recursive: true });
    await fsp.writeFile(path.join(tmpDir, "outside", "secret.txt"), "sensitive data");
  });

  afterAll(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  describe("isRealPathInside", () => {
    it("allows normal file inside workspace", () => {
      expect(isRealPathInside(workspace, "safe.txt")).toBe(true);
    });

    it("allows subdirectory paths", () => {
      expect(isRealPathInside(workspace, "sub/dir/file.txt")).toBe(true);
    });

    it("blocks ../ traversal", () => {
      expect(isRealPathInside(workspace, "../outside/secret.txt")).toBe(false);
    });

    it("blocks absolute paths outside workspace", () => {
      expect(isRealPathInside(workspace, "/etc/passwd")).toBe(false);
    });

    it.skipIf(isWindows)("blocks symlink pointing outside workspace", async () => {
      const linkPath = path.join(workspace, "evil-link");
      await fsp.symlink(path.join(tmpDir, "outside", "secret.txt"), linkPath);
      try {
        expect(isRealPathInside(workspace, "evil-link")).toBe(false);
      } finally {
        await fsp.unlink(linkPath);
      }
    });

    it.skipIf(isWindows)("blocks directory symlink pointing outside workspace", async () => {
      const linkPath = path.join(workspace, "evil-dir");
      await fsp.symlink(path.join(tmpDir, "outside"), linkPath, "dir");
      try {
        expect(isRealPathInside(workspace, "evil-dir/secret.txt")).toBe(false);
      } finally {
        await fsp.unlink(linkPath);
      }
    });

    it.skipIf(isWindows)("allows symlink that stays within workspace", async () => {
      await fsp.writeFile(path.join(workspace, "real-file.txt"), "content");
      const linkPath = path.join(workspace, "safe-link");
      await fsp.symlink(path.join(workspace, "real-file.txt"), linkPath);
      try {
        expect(isRealPathInside(workspace, "safe-link")).toBe(true);
      } finally {
        await fsp.unlink(linkPath);
      }
    });

    it("allows paths that don't exist yet (new file creation)", () => {
      expect(isRealPathInside(workspace, "new-file-that-doesnt-exist.txt")).toBe(true);
    });
  });

  describe("assertRealPathInWorkspace", () => {
    it("does not throw for safe paths", () => {
      expect(() => assertRealPathInWorkspace("safe.txt", workspace)).not.toThrow();
    });

    it("throws for ../ traversal", () => {
      expect(() => assertRealPathInWorkspace("../outside/secret.txt", workspace)).toThrow(
        /Path escape blocked/,
      );
    });

    it.skipIf(isWindows)("throws for symlink escape", async () => {
      const linkPath = path.join(workspace, "sneaky-link");
      await fsp.symlink(path.join(tmpDir, "outside", "secret.txt"), linkPath);
      try {
        expect(() => assertRealPathInWorkspace("sneaky-link", workspace)).toThrow(
          /Path escape blocked/,
        );
      } finally {
        await fsp.unlink(linkPath);
      }
    });
  });
});
