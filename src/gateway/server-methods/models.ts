import { loadConfig } from "../../config/config.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateModelsListParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const modelsHandlers: GatewayRequestHandlers = {
  "models.list": async ({ params, respond }) => {
    if (!validateModelsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid models.list params: ${formatValidationErrors(validateModelsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const cfg = loadConfig();

      // Flatten models from config providers (deduplicated by id)
      const seen = new Set<string>();
      const models: Array<{
        id: string;
        name: string;
        provider: string;
        contextWindow?: number;
        reasoning?: boolean;
      }> = [];
      for (const [providerKey, provider] of Object.entries(cfg.models?.providers ?? {})) {
        for (const m of provider.models ?? []) {
          if (!m.id || seen.has(m.id)) {
            continue;
          }
          seen.add(m.id);
          models.push({
            id: m.id,
            name: m.name || m.id,
            provider: providerKey,
            ...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
            ...(typeof m.reasoning === "boolean" ? { reasoning: m.reasoning } : {}),
          });
        }
      }

      // Default model from agent defaults
      const defaultModel = cfg.agents?.defaults?.model?.primary ?? undefined;

      respond(true, { models, ...(defaultModel ? { defaultModel } : {}) }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },
};
