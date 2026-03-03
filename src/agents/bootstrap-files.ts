import type { OpenClawConfig } from "../config/config.js";
import { isTruthyEnvValue, logAcceptedEnvOption } from "../infra/env.js";
import { applyBootstrapHookOverrides } from "./bootstrap-hooks.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import {
  buildBootstrapContextFiles,
  resolveBootstrapMaxChars,
  resolveBootstrapTotalMaxChars,
} from "./pi-embedded-helpers.js";
import {
  filterBootstrapFilesForSession,
  isWorkspaceOnboardingCompleted,
  loadWorkspaceBootstrapFiles,
  type WorkspaceBootstrapFile,
} from "./workspace.js";

export function makeBootstrapWarn(params: {
  sessionLabel: string;
  warn?: (message: string) => void;
}): ((message: string) => void) | undefined {
  if (!params.warn) {
    return undefined;
  }
  return (message: string) => params.warn?.(`${message} (sessionKey=${params.sessionLabel})`);
}

export async function resolveBootstrapFilesForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
}): Promise<WorkspaceBootstrapFile[]> {
  const sessionKey = params.sessionKey ?? params.sessionId;
  const bootstrapFiles = filterBootstrapFilesForSession(
    await loadWorkspaceBootstrapFiles(params.workspaceDir),
    sessionKey,
  );

  return applyBootstrapHookOverrides({
    files: bootstrapFiles,
    workspaceDir: params.workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
  });
}

const ONBOARDING_GATE_CONTENT = `# ⚠️ Onboarding Required

This workspace has not completed onboarding. You MUST guide the user through the onboarding
process defined in BOOTSTRAP.md before doing anything else.

If the user asks you to do something unrelated, remind them that onboarding needs to be
completed first. If they explicitly say "skip onboarding" or "I don't want to do this",
fill in IDENTITY.md and USER.md with reasonable defaults based on any context you have,
then delete BOOTSTRAP.md to mark onboarding as complete.

Do NOT proceed with other tasks until onboarding is resolved.`;

export async function resolveBootstrapContextForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  warn?: (message: string) => void;
}): Promise<{
  bootstrapFiles: WorkspaceBootstrapFile[];
  contextFiles: EmbeddedContextFile[];
}> {
  const bootstrapFiles = await resolveBootstrapFilesForRun(params);
  const contextFiles = buildBootstrapContextFiles(bootstrapFiles, {
    maxChars: resolveBootstrapMaxChars(params.config),
    totalMaxChars: resolveBootstrapTotalMaxChars(params.config),
    warn: params.warn,
  });

  if (!isTruthyEnvValue(process.env.OPENCLAW_SKIP_ONBOARDING_GATE)) {
    logAcceptedEnvOption({
      key: "OPENCLAW_SKIP_ONBOARDING_GATE",
      description: "skip onboarding-required system prompt injection",
    });
    const onboardingComplete = await isWorkspaceOnboardingCompleted(params.workspaceDir);
    if (!onboardingComplete) {
      contextFiles.unshift({
        path: "ONBOARDING_REQUIRED",
        content: ONBOARDING_GATE_CONTENT,
      });
    }
  }

  return { bootstrapFiles, contextFiles };
}
