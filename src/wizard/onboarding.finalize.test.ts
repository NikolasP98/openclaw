import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OnboardOptions } from "../cli/commands/onboard-types.js";
import type { RuntimeEnv } from "../runtime.js";
import { finalizeOnboardingWizard } from "./onboarding.finalize.js";
import type { WizardPrompter } from "./prompts.js";

const mocks = vi.hoisted(() => ({
  detectBrowserOpenSupport: vi.fn(async () => ({ ok: true })),
  openUrl: vi.fn(async () => true),
  probeGatewayReachable: vi.fn(async () => ({ ok: true })),
  ensureControlUiAssetsBuilt: vi.fn(async () => ({ ok: true })),
  setupOnboardingShellCompletion: vi.fn(async () => {}),
  runTui: vi.fn(async () => {}),
}));

vi.mock("../cli/commands/onboard-helpers.js", async (importActual) => {
  const actual = await importActual<typeof import("../cli/commands/onboard-helpers.js")>();
  return {
    ...actual,
    detectBrowserOpenSupport: mocks.detectBrowserOpenSupport,
    openUrl: mocks.openUrl,
    probeGatewayReachable: mocks.probeGatewayReachable,
  };
});

vi.mock("../infra/control-ui-assets.js", () => ({
  ensureControlUiAssetsBuilt: mocks.ensureControlUiAssetsBuilt,
}));

vi.mock("./onboarding.completion.js", () => ({
  setupOnboardingShellCompletion: mocks.setupOnboardingShellCompletion,
}));

vi.mock("../tui/tui.js", () => ({
  runTui: mocks.runTui,
}));

function createPrompter(overrides?: Partial<WizardPrompter>): WizardPrompter {
  const select: WizardPrompter["select"] = vi.fn(async (params) => {
    if (params.message === "How do you want to hatch your bot?") {
      return "web" as never;
    }
    return (params.initialValue ?? params.options[0]?.value) as never;
  });
  const multiselect: WizardPrompter["multiselect"] = vi.fn(async () => []);

  return {
    intro: vi.fn(async () => {}),
    outro: vi.fn(async () => {}),
    note: vi.fn(async () => {}),
    select,
    multiselect,
    text: vi.fn(async () => ""),
    confirm: vi.fn(async () => false),
    progress: vi.fn(() => ({
      update: vi.fn(),
      stop: vi.fn(),
    })),
    ...overrides,
  };
}

function createRuntime(): RuntimeEnv {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn((code: number): never => {
      throw new Error(`exit:${code}`);
    }),
  };
}

describe("finalizeOnboardingWizard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.detectBrowserOpenSupport.mockClear();
    mocks.openUrl.mockClear();
    mocks.probeGatewayReachable.mockClear();
    mocks.ensureControlUiAssetsBuilt.mockClear();
    mocks.setupOnboardingShellCompletion.mockClear();
    mocks.runTui.mockClear();
  });

  // URL format: "http://127.0.0.1:{port}/#token=..." (no /chat path, no session query param
  // since the webchat now resolves the main session automatically on load).
  it("opens loopback webchat URL when bind=loopback", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-onboarding-finalize-"));

    const opts: OnboardOptions = {
      installDaemon: false,
      skipHealth: true,
      skipProviders: true,
      skipSkills: true,
    };
    const prompter = createPrompter();
    const runtime = createRuntime();

    await finalizeOnboardingWizard({
      flow: "quickstart",
      opts,
      baseConfig: {},
      nextConfig: {},
      workspaceDir,
      settings: {
        port: 18789,
        bind: "loopback",
        authMode: "token",
        gatewayToken: "test token",
        tailscaleMode: "off",
        tailscaleResetOnExit: false,
      },
      prompter,
      runtime,
    });

    expect(mocks.openUrl).toHaveBeenCalledWith("http://127.0.0.1:18789/#token=test%20token");

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });
});
