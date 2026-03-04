import { listAgentIds, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import type { ToolMeta } from "../../agents/tool-meta.js";
import {
  TOOL_GROUPS,
  expandToolGroups,
  resolveToolProfilePolicy,
} from "../../agents/tool-policy.js";
import { TOOL_REGISTRY } from "../../agents/tools/_registry.generated.js";
import { loadConfig } from "../../config/config.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateToolsStatusParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export type ToolStatusEntry = {
  id: string;
  groups: string[];
  requires?: ToolMeta["requires"];
  install?: ToolMeta["install"];
  optional?: boolean;
  mcpExport?: boolean;
  multi?: boolean;
  condition?: string;
  enabled: boolean;
};

function resolveAgentToolPolicy(
  cfg: ReturnType<typeof loadConfig>,
  agentId: string,
): { profile: string; allow?: string[]; deny?: string[]; alsoAllow?: string[] } {
  const agents = cfg.agents?.list ?? [];
  const agent = agents.find((a) => normalizeAgentId(a.id) === agentId);
  const agentTools = agent?.tools ?? {};
  const globalTools = cfg.tools ?? {};
  const profile =
    ((agentTools as Record<string, unknown>).profile as string | undefined) ??
    ((globalTools as Record<string, unknown>).profile as string | undefined) ??
    "full";
  return {
    profile,
    allow:
      (agentTools as Record<string, string[]>).allow ??
      (globalTools as Record<string, string[]>).allow,
    deny:
      (agentTools as Record<string, string[]>).deny ??
      (globalTools as Record<string, string[]>).deny,
    alsoAllow: (agentTools as Record<string, string[]>).alsoAllow,
  };
}

function isToolAllowed(toolId: string, policy: ReturnType<typeof resolveAgentToolPolicy>): boolean {
  const profilePolicy = resolveToolProfilePolicy(policy.profile);
  // Explicit allowlist takes precedence
  if (Array.isArray(policy.allow) && policy.allow.length > 0) {
    const expanded = expandToolGroups(policy.allow);
    if (!expanded.includes(toolId)) {
      return false;
    }
    if (Array.isArray(policy.deny) && policy.deny.length > 0) {
      const expandedDeny = expandToolGroups(policy.deny);
      return !expandedDeny.includes(toolId);
    }
    return true;
  }
  // Profile-based policy
  if (profilePolicy?.allow) {
    const expanded = expandToolGroups(profilePolicy.allow);
    const alsoAllow = policy.alsoAllow ? expandToolGroups(policy.alsoAllow) : [];
    const baseAllowed = expanded.includes(toolId);
    const extraAllowed = alsoAllow.includes(toolId);
    if (!baseAllowed && !extraAllowed) {
      return false;
    }
  }
  // Check deny list
  if (Array.isArray(policy.deny) && policy.deny.length > 0) {
    const expandedDeny = expandToolGroups(policy.deny);
    if (expandedDeny.includes(toolId)) {
      return false;
    }
  }
  return true;
}

export const toolsHandlers: GatewayRequestHandlers = {
  "tools.status": ({ params, respond }) => {
    if (!validateToolsStatusParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid tools.status params: ${formatValidationErrors(validateToolsStatusParams.errors)}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const agentIdRaw = typeof params?.agentId === "string" ? params.agentId.trim() : "";
    const agentId = agentIdRaw ? normalizeAgentId(agentIdRaw) : resolveDefaultAgentId(cfg);
    if (agentIdRaw) {
      const knownAgents = listAgentIds(cfg);
      if (!knownAgents.includes(agentId)) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unknown agent id "${agentIdRaw}"`),
        );
        return;
      }
    }
    const policy = resolveAgentToolPolicy(cfg, agentId);
    const tools: ToolStatusEntry[] = [];
    for (const [id, entry] of Object.entries(TOOL_REGISTRY)) {
      const meta = entry.meta;
      tools.push({
        id,
        groups: meta.groups,
        requires: meta.requires,
        install: meta.install,
        optional: meta.optional,
        mcpExport: meta.mcpExport,
        multi: meta.multi,
        condition: meta.condition,
        enabled: isToolAllowed(id, policy),
      });
    }
    respond(true, { tools, groups: TOOL_GROUPS, profile: policy.profile }, undefined);
  },
};
