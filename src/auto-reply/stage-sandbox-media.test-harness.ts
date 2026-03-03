import { join } from "node:path";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import type { OpenClawConfig } from "../config/config.js";
import type { MsgContext, TemplateContext } from "./templating.js";

export async function withSandboxMediaTempHome<T>(
  prefix: string,
  fn: (home: string) => Promise<T>,
): Promise<T> {
  return withTempHomeBase(async (home) => await fn(home), {
    prefix,
    // The test creates media files at home/.openclaw/media/... (legacy path).
    // Both env vars are set to the same value: MINION_STATE_DIR for post-rename code
    // and OPENCLAW_STATE_DIR for legacy code paths, so getMediaDir() resolves correctly
    // regardless of which variable the implementation currently reads.
    env: {
      MINION_STATE_DIR: (home: string) => join(home, ".openclaw"),
      OPENCLAW_STATE_DIR: (home: string) => join(home, ".openclaw"),
    },
  });
}

export function createSandboxMediaContexts(mediaPath: string): {
  ctx: MsgContext;
  sessionCtx: TemplateContext;
} {
  const ctx: MsgContext = {
    Body: "hi",
    From: "whatsapp:group:demo",
    To: "+2000",
    ChatType: "group",
    Provider: "whatsapp",
    MediaPath: mediaPath,
    MediaType: "image/jpeg",
    MediaUrl: mediaPath,
  };
  return { ctx, sessionCtx: { ...ctx } };
}

export function createSandboxMediaStageConfig(home: string): OpenClawConfig {
  return {
    agents: {
      defaults: {
        model: "anthropic/claude-opus-4-5",
        workspace: join(home, "openclaw"),
        sandbox: {
          mode: "non-main",
          workspaceRoot: join(home, "sandboxes"),
        },
      },
    },
    channels: { whatsapp: { allowFrom: ["*"] } },
    session: { store: join(home, "sessions.json") },
  } as OpenClawConfig;
}
