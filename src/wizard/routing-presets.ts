/**
 * Smart routing strategy presets for the onboarding wizard.
 *
 * Queries local model servers (Ollama) for available models and offers
 * 3 preset configurations: Balanced, Local-only, All-API.
 *
 * Inspired by LocalClaw's onboarding strategy presets.
 */

import type { AgentOrchestratorConfig, AgentRoutingConfig } from "../auto-reply/reply/smart-routing.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("wizard/routing-presets");

// ── Types ────────────────────────────────────────────────────────────

export type PresetName = "balanced" | "local-only" | "all-api";

export type RoutingPreset = {
  name: PresetName;
  label: string;
  description: string;
  routing: AgentRoutingConfig;
  orchestrator: AgentOrchestratorConfig;
};

export type OllamaModel = {
  name: string;
  /** Size in bytes. */
  size: number;
  /** Parameter count string (e.g. "3B", "7B"). */
  parameterSize?: string;
};

// ── Ollama detection ─────────────────────────────────────────────────

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

/**
 * Detect available Ollama models by querying the Ollama API.
 * Returns an empty array if Ollama is unreachable.
 */
export async function detectOllamaModels(
  baseUrl = DEFAULT_OLLAMA_URL,
): Promise<OllamaModel[]> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as { models?: Array<{ name: string; size: number; details?: { parameter_size?: string } }> };
    return (data.models ?? []).map((m) => ({
      name: m.name,
      size: m.size,
      parameterSize: m.details?.parameter_size,
    }));
  } catch {
    log.debug("Ollama not reachable at " + baseUrl);
    return [];
  }
}

/**
 * Pick the best models for fast (small) and local (medium) tiers from available Ollama models.
 */
export function pickTierModels(models: OllamaModel[]): {
  fast: string | undefined;
  local: string | undefined;
} {
  if (models.length === 0) return { fast: undefined, local: undefined };

  // Sort by size ascending.
  const sorted = [...models].sort((a, b) => a.size - b.size);

  // Fast tier: smallest model.
  const fast = sorted[0]?.name;

  // Local tier: largest model (or second-largest if only two).
  const local = sorted.length > 1 ? sorted[sorted.length - 1]?.name : fast;

  return {
    fast: fast ? `ollama/${fast}` : undefined,
    local: local ? `ollama/${local}` : undefined,
  };
}

// ── Presets ───────────────────────────────────────────────────────────

/**
 * Build routing presets based on available models.
 *
 * @param apiModel - The configured API model (e.g. "anthropic/claude-sonnet-4")
 * @param ollamaModels - Available Ollama models (pass empty array if none)
 */
export function buildPresets(
  apiModel: string,
  ollamaModels: OllamaModel[],
): RoutingPreset[] {
  const { fast, local } = pickTierModels(ollamaModels);
  const hasLocal = ollamaModels.length > 0;

  const presets: RoutingPreset[] = [];

  if (hasLocal && fast && local) {
    presets.push({
      name: "balanced",
      label: "Balanced (Recommended)",
      description: `Simple → ${fast}, Moderate → ${local}, Complex → ${apiModel}. Best cost/quality balance.`,
      routing: {
        enabled: true,
        fastModel: fast,
        localModel: local,
        fastModelContextTokens: 4096,
      },
      orchestrator: {
        enabled: true,
        model: apiModel,
        strategy: "auto",
      },
    });

    presets.push({
      name: "local-only",
      label: "Local-only",
      description: `Everything handled by ${local}. API model used only if local model fails. Zero API cost.`,
      routing: {
        enabled: true,
        fastModel: fast,
        localModel: local,
        fastModelContextTokens: 4096,
      },
      orchestrator: {
        enabled: true,
        model: apiModel,
        strategy: "fallback-only",
      },
    });
  }

  presets.push({
    name: "all-api",
    label: "All-API",
    description: `Everything handled by ${apiModel}. No local models needed. Higher cost, highest quality.`,
    routing: { enabled: false },
    orchestrator: { enabled: false },
  });

  return presets;
}
