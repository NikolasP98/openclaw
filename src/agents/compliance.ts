import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { resolveAgentDir, resolveAgentWorkspaceDir, resolveDefaultAgentId } from "./agent-scope.js";
import {
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
} from "./workspace.js";

export type ComplianceLevel = "error" | "warn";

export type ComplianceIssue = {
  level: ComplianceLevel;
  message: string;
};

export type AgentComplianceResult = {
  agentId: string;
  issues: ComplianceIssue[];
  /** true when there are no error-level issues (warnings are allowed) */
  passed: boolean;
};

const REQUIRED_WORKSPACE_FILES = [
  DEFAULT_AGENTS_FILENAME,
  DEFAULT_IDENTITY_FILENAME,
  DEFAULT_SOUL_FILENAME,
  DEFAULT_TOOLS_FILENAME,
  DEFAULT_USER_FILENAME,
] as const;

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function checkAgentCompliance(
  cfg: OpenClawConfig,
  agentId: string,
): Promise<AgentComplianceResult> {
  const issues: ComplianceIssue[] = [];
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const agentDir = resolveAgentDir(cfg, agentId);

  // 1. Workspace directory
  if (!(await isDir(workspaceDir))) {
    issues.push({ level: "error", message: `workspace directory missing: ${workspaceDir}` });
  } else {
    // 2. Required workspace files
    const missing = (
      await Promise.all(
        REQUIRED_WORKSPACE_FILES.map(async (name) => ({
          name,
          exists: await exists(path.join(workspaceDir, name)),
        })),
      )
    )
      .filter((f) => !f.exists)
      .map((f) => f.name);
    if (missing.length > 0) {
      issues.push({ level: "error", message: `missing workspace files: ${missing.join(", ")}` });
    }
  }

  // 3. AgentDir directory
  if (!(await isDir(agentDir))) {
    issues.push({ level: "error", message: `agentDir missing: ${agentDir}` });
  } else {
    // 4. auth-profiles.json (warn only — user may have skipped auth setup)
    if (!(await exists(path.join(agentDir, "auth-profiles.json")))) {
      issues.push({
        level: "warn",
        message: "auth-profiles.json not found — run `minion agents auth` to configure",
      });
    }

    // 5. Stale .tmp files
    try {
      const stale = (await fs.readdir(agentDir)).filter((e) => e.endsWith(".tmp"));
      if (stale.length > 0) {
        issues.push({
          level: "warn",
          message: `stale .tmp files in agentDir: ${stale.join(", ")}`,
        });
      }
    } catch {
      // ignore
    }
  }

  // 6. Routing
  const isDefault = resolveDefaultAgentId(cfg) === agentId;
  const isBound = (cfg.bindings ?? []).some((b) => b.agentId === agentId);
  if (!isDefault && !isBound) {
    issues.push({
      level: "warn",
      message: "no channel binding and not the default agent — only reachable via web UI",
    });
  }

  return {
    agentId,
    issues,
    passed: issues.every((i) => i.level !== "error"),
  };
}
