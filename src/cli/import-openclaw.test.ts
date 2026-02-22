import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyWorkspaceFiles, formatReport, migrateConfig } from "./import-openclaw.js";
import type { MigrationReport } from "./import-openclaw.js";

describe("import-openclaw", () => {
  describe("migrateConfig", () => {
    it("maps known config keys", () => {
      const { minionConfig, report } = migrateConfig({
        models: { default: "claude-sonnet-4" },
        gateway: { port: 18789 },
        channels: { telegram: { token: "abc123" } },
      });

      expect(minionConfig).toEqual({
        models: { default: "claude-sonnet-4" },
        gateway: { port: 18789 },
        channels: { telegram: { token: "abc123" } },
      });
      expect(report.mapped.length).toBeGreaterThanOrEqual(3);
    });

    it("reports unmapped keys", () => {
      const { report } = migrateConfig({
        models: { default: "claude-sonnet-4" },
        customFeature: { enabled: true },
      });

      expect(report.unmapped.some((u) => u.key.startsWith("customFeature"))).toBe(true);
    });

    it("warns about secret keys", () => {
      const { report } = migrateConfig({
        claude: { apiKey: "sk-ant-secret" },
      });

      expect(report.warnings.some((w) => w.includes("env var"))).toBe(true);
    });

    it("handles empty config", () => {
      const { minionConfig, report } = migrateConfig({});
      expect(minionConfig).toEqual({});
      expect(report.mapped).toHaveLength(0);
    });
  });

  describe("copyWorkspaceFiles", () => {
    let tmpDir: string;
    let sourceDir: string;
    let targetDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "import-test-"));
      sourceDir = path.join(tmpDir, "openclaw-workspace");
      targetDir = path.join(tmpDir, "minion-workspace");
      await fs.mkdir(sourceDir, { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it("copies workspace files", async () => {
      await fs.writeFile(path.join(sourceDir, "SOUL.md"), "test soul");
      await fs.writeFile(path.join(sourceDir, "USER.md"), "test user");

      const report: MigrationReport = {
        mapped: [], unmapped: [], copiedFiles: [], failedFiles: [], warnings: [],
      };
      await copyWorkspaceFiles({ sourceDir, targetDir, report });

      expect(report.copiedFiles).toContain("SOUL.md");
      expect(report.copiedFiles).toContain("USER.md");
      const content = await fs.readFile(path.join(targetDir, "SOUL.md"), "utf-8");
      expect(content).toBe("test soul");
    });

    it("does not overwrite existing files", async () => {
      await fs.writeFile(path.join(sourceDir, "SOUL.md"), "source soul");
      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(path.join(targetDir, "SOUL.md"), "existing soul");

      const report: MigrationReport = {
        mapped: [], unmapped: [], copiedFiles: [], failedFiles: [], warnings: [],
      };
      await copyWorkspaceFiles({ sourceDir, targetDir, report });

      const content = await fs.readFile(path.join(targetDir, "SOUL.md"), "utf-8");
      expect(content).toBe("existing soul");
      expect(report.warnings.some((w) => w.includes("SOUL.md"))).toBe(true);
    });

    it("copies memory directory", async () => {
      const memDir = path.join(sourceDir, "memory");
      await fs.mkdir(memDir, { recursive: true });
      await fs.writeFile(path.join(memDir, "2026-02-21.md"), "daily note");

      const report: MigrationReport = {
        mapped: [], unmapped: [], copiedFiles: [], failedFiles: [], warnings: [],
      };
      await copyWorkspaceFiles({ sourceDir, targetDir, report });

      const content = await fs.readFile(
        path.join(targetDir, "memory", "2026-02-21.md"),
        "utf-8",
      );
      expect(content).toBe("daily note");
    });

    it("handles missing source files gracefully", async () => {
      const report: MigrationReport = {
        mapped: [], unmapped: [], copiedFiles: [], failedFiles: [], warnings: [],
      };
      await copyWorkspaceFiles({ sourceDir, targetDir, report });
      expect(report.copiedFiles).toHaveLength(0);
      expect(report.failedFiles).toHaveLength(0);
    });
  });

  describe("formatReport", () => {
    it("formats a complete report", () => {
      const report: MigrationReport = {
        mapped: [{ source: "models.default", target: "models.default", value: "claude" }],
        unmapped: [{ key: "custom.thing", value: true, reason: "no mapping" }],
        copiedFiles: ["SOUL.md"],
        failedFiles: [],
        warnings: ["Set API key as env var"],
      };
      const text = formatReport(report);
      expect(text).toContain("Mapped (1 keys)");
      expect(text).toContain("Unmapped (1 keys");
      expect(text).toContain("SOUL.md");
      expect(text).toContain("env var");
    });

    it("formats empty report", () => {
      const report: MigrationReport = {
        mapped: [], unmapped: [], copiedFiles: [], failedFiles: [], warnings: [],
      };
      const text = formatReport(report);
      expect(text).toContain("Migration Report");
    });
  });
});
