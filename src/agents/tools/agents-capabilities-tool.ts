import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import {
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../../routing/session-key.js";
import { resolveAgentConfig } from "../agent-scope.js";
import { jsonResult } from "./common.js";
import { resolveInternalSessionKey, resolveMainSessionAlias } from "./sessions-helpers.js";

const AgentsCapabilitiesToolSchema = Type.Object({});

type AgentCapabilitiesEntry = {
  id: string;
  name?: string;
  role?: "orchestrator" | "specialist";
  description?: string;
  keywords?: string[];
  taskTypes?: string[];
  estimatedTime?: string;
  model?: string;
};

export function createAgentsCapabilitiesTool(opts?: {
  agentSessionKey?: string;
  /** Explicit agent ID override for cron/hook sessions. */
  requesterAgentIdOverride?: string;
}): AnyAgentTool {
  return {
    label: "Agent Capabilities",
    name: "agents_capabilities",
    description:
      "List available specialist agents and their capabilities (role, description, keywords, task types, estimated time). Use this to discover which specialist to delegate tasks to based on keywords and capabilities.",
    parameters: AgentsCapabilitiesToolSchema,
    execute: async () => {
      const cfg = loadConfig();
      const { mainKey, alias } = resolveMainSessionAlias(cfg);
      const requesterInternalKey =
        typeof opts?.agentSessionKey === "string" && opts.agentSessionKey.trim()
          ? resolveInternalSessionKey({
              key: opts.agentSessionKey,
              alias,
              mainKey,
            })
          : alias;
      const requesterAgentId = normalizeAgentId(
        opts?.requesterAgentIdOverride ??
          parseAgentSessionKey(requesterInternalKey)?.agentId ??
          DEFAULT_AGENT_ID,
      );

      const allowAgents = resolveAgentConfig(cfg, requesterAgentId)?.subagents?.allowAgents ?? [];
      const allowAny = allowAgents.some((value) => value.trim() === "*");
      const allowSet = new Set(
        allowAgents
          .filter((value) => value.trim() && value.trim() !== "*")
          .map((value) => normalizeAgentId(value)),
      );

      const configuredAgents = Array.isArray(cfg.agents?.list) ? cfg.agents?.list : [];
      const configuredIds = configuredAgents.map((entry) => normalizeAgentId(entry.id));

      // Build allowed set
      const allowed = new Set<string>();
      allowed.add(requesterAgentId);
      if (allowAny) {
        for (const id of configuredIds) {
          allowed.add(id);
        }
      } else {
        for (const id of allowSet) {
          allowed.add(id);
        }
      }

      // Build capabilities list for allowed agents
      const capabilities: AgentCapabilitiesEntry[] = [];
      for (const agentConfig of configuredAgents) {
        const agentId = normalizeAgentId(agentConfig.id);
        if (!allowed.has(agentId)) {
          continue;
        }

        const caps = agentConfig.capabilities;
        const modelConfig = agentConfig.model;
        const modelStr =
          typeof modelConfig === "string"
            ? modelConfig
            : modelConfig?.primary
              ? modelConfig.primary
              : undefined;

        capabilities.push({
          id: agentId,
          name: agentConfig.name?.trim() || undefined,
          role: caps?.role,
          description: caps?.description,
          keywords: caps?.keywords,
          taskTypes: caps?.taskTypes,
          estimatedTime: caps?.estimatedTime,
          model: modelStr,
        });
      }

      // Sort: orchestrators first, then specialists alphabetically
      const sorted = capabilities.toSorted((a, b) => {
        if (a.role === "orchestrator" && b.role !== "orchestrator") {
          return -1;
        }
        if (a.role !== "orchestrator" && b.role === "orchestrator") {
          return 1;
        }
        return a.id.localeCompare(b.id);
      });

      return jsonResult({
        requester: requesterAgentId,
        agents: sorted,
      });
    },
  };
}
