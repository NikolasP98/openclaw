import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearInternalHooks,
  registerInternalHook,
  type AgentBootstrapHookContext,
} from "../hooks/internal-hooks.js";
import { makeTempWorkspace } from "../test-support/workspace.js";
import { resolveBootstrapContextForRun, resolveBootstrapFilesForRun } from "./bootstrap-files.js";
import type { WorkspaceBootstrapFile } from "./identity/workspace.js";

function registerExtraBootstrapFileHook() {
  registerInternalHook("agent:bootstrap", (event) => {
    const context = event.context as AgentBootstrapHookContext;
    context.bootstrapFiles = [
      ...context.bootstrapFiles,
      {
        name: "EXTRA.md",
        path: path.join(context.workspaceDir, "EXTRA.md"),
        content: "extra",
        missing: false,
      } as unknown as WorkspaceBootstrapFile,
    ];
  });
}

describe("resolveBootstrapFilesForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => clearInternalHooks());

  it("applies bootstrap hook overrides", async () => {
    registerExtraBootstrapFileHook();

    const workspaceDir = await makeTempWorkspace("minion-bootstrap-");
    const files = await resolveBootstrapFilesForRun({ workspaceDir });

    expect(files.some((file) => file.path === path.join(workspaceDir, "EXTRA.md"))).toBe(true);
  });
});

describe("resolveBootstrapContextForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => clearInternalHooks());

  it("returns context files for hook-adjusted bootstrap files", async () => {
    registerExtraBootstrapFileHook();

    const workspaceDir = await makeTempWorkspace("minion-bootstrap-");
    const result = await resolveBootstrapContextForRun({ workspaceDir });
    const extra = result.contextFiles.find(
      (file) => file.path === path.join(workspaceDir, "EXTRA.md"),
    );

    expect(extra?.content).toBe("extra");
  });

  it("prepends onboarding gate when onboarding is incomplete", async () => {
    const workspaceDir = await makeTempWorkspace("minion-bootstrap-");
    delete process.env.OPENCLAW_SKIP_ONBOARDING_GATE;

    const result = await resolveBootstrapContextForRun({ workspaceDir });
    const gate = result.contextFiles.find((file) => file.path === "ONBOARDING_REQUIRED");

    expect(gate).toBeDefined();
    expect(gate?.content).toContain("Onboarding Required");
  });

  it("skips onboarding gate when onboarding is complete", async () => {
    const workspaceDir = await makeTempWorkspace("minion-bootstrap-");
    const stateDir = path.join(workspaceDir, ".minion");
    await fs.mkdir(stateDir, { recursive: true });
    await fs.writeFile(
      path.join(stateDir, "workspace-state.json"),
      JSON.stringify({ version: 1, onboardingCompletedAt: "2026-01-01T00:00:00.000Z" }),
    );
    delete process.env.OPENCLAW_SKIP_ONBOARDING_GATE;

    const result = await resolveBootstrapContextForRun({ workspaceDir });
    const gate = result.contextFiles.find((file) => file.path === "ONBOARDING_REQUIRED");

    expect(gate).toBeUndefined();
  });

  it("skips onboarding gate when OPENCLAW_SKIP_ONBOARDING_GATE is set", async () => {
    const workspaceDir = await makeTempWorkspace("minion-bootstrap-");
    process.env.OPENCLAW_SKIP_ONBOARDING_GATE = "true";

    try {
      const result = await resolveBootstrapContextForRun({ workspaceDir });
      const gate = result.contextFiles.find((file) => file.path === "ONBOARDING_REQUIRED");
      expect(gate).toBeUndefined();
    } finally {
      delete process.env.OPENCLAW_SKIP_ONBOARDING_GATE;
    }
  });
});
