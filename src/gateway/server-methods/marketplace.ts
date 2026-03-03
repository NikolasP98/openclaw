import fs from "node:fs/promises";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

/** Safe agent ID: alphanumeric, hyphens, underscores only. No path traversal. */
const SAFE_AGENT_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** Allowed file names for marketplace agent installation. */
const ALLOWED_MARKETPLACE_FILES = new Set([
  "agent.json",
  "SOUL.md",
  "IDENTITY.md",
  "USER.md",
  "CONTEXT.md",
  "SKILLS.md",
]);

/**
 * Resolve the directory where marketplace agents are installed:
 * `<stateDir>/marketplace/agents/<agentId>/`
 */
function resolveMarketplaceAgentDir(agentId: string): string {
  const stateDir = resolveStateDir();
  return path.join(stateDir, "marketplace", "agents", agentId);
}

export const marketplaceHandlers: GatewayRequestHandlers = {
  /**
   * Install a marketplace agent by writing its files to the gateway filesystem.
   *
   * Params:
   *   agentId: string  — the agent slug (e.g. "luna-chen")
   *   files: Record<string, string>  — map of filename → file content
   *
   * Writes files to: `<stateDir>/marketplace/agents/<agentId>/`
   * Only allows known filenames: agent.json, SOUL.md, IDENTITY.md, USER.md, CONTEXT.md, SKILLS.md
   */
  "agent.install": async ({ params, respond }) => {
    const agentId = typeof params.agentId === "string" ? params.agentId.trim() : "";
    if (!agentId || !SAFE_AGENT_ID_RE.test(agentId)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "agentId must be a non-empty alphanumeric slug"),
      );
      return;
    }

    if (!params.files || typeof params.files !== "object" || Array.isArray(params.files)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "files must be a non-null object"),
      );
      return;
    }

    const files = params.files as Record<string, unknown>;
    const fileEntries = Object.entries(files);

    if (fileEntries.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "files must not be empty"));
      return;
    }

    // Validate all file names and content before writing anything
    for (const [name, content] of fileEntries) {
      if (!ALLOWED_MARKETPLACE_FILES.has(name)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unsupported file: ${name}`),
        );
        return;
      }
      if (typeof content !== "string") {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `file content for "${name}" must be a string`),
        );
        return;
      }
    }

    const agentDir = resolveMarketplaceAgentDir(agentId);
    await fs.mkdir(agentDir, { recursive: true });

    const written: string[] = [];
    for (const [name, content] of fileEntries) {
      const filePath = path.join(agentDir, name);
      await fs.writeFile(filePath, content as string, "utf-8");
      written.push(name);
    }

    respond(true, { agentId, dir: agentDir, files: written });
  },
};
