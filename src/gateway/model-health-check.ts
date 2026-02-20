/**
 * Local model health check + Ollama warmup.
 *
 * On gateway boot, probes local model servers (Ollama, LM Studio, vLLM)
 * for reachability and model availability. Optionally pre-warms models
 * into memory for faster first-response latency.
 *
 * Inspired by LocalClaw's health check + warmup system.
 *
 * @module
 */

import type { AgentRoutingConfig } from "../auto-reply/reply/smart-routing.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthCheckResult = {
  server: string;
  reachable: boolean;
  model?: string;
  modelFound?: boolean;
  contextWindow?: number;
  warmedUp?: boolean;
  error?: string;
};

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
};

// ── Constants ────────────────────────────────────────────────────────────────

const OLLAMA_DEFAULT_BASE = "http://127.0.0.1:11434";
const OPENAI_COMPAT_DEFAULT_BASE = "http://127.0.0.1:1234"; // LM Studio default
const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const MIN_DESIRED_CONTEXT = 32_768;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseModelRef(ref: string | undefined): { provider: string; model: string } | undefined {
  if (!ref) {
    return undefined;
  }
  const slash = ref.indexOf("/");
  if (slash < 1) {
    return undefined;
  }
  return { provider: ref.slice(0, slash), model: ref.slice(slash + 1) };
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? HEALTH_CHECK_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Ollama ───────────────────────────────────────────────────────────────────

async function checkOllama(params: {
  modelName: string;
  baseUrl?: string;
  warmup?: boolean;
  log: Logger;
}): Promise<HealthCheckResult> {
  const { modelName, warmup = true, log } = params;
  const base = params.baseUrl ?? OLLAMA_DEFAULT_BASE;
  const result: HealthCheckResult = {
    server: `ollama @ ${base}`,
    reachable: false,
    model: modelName,
  };

  // 1. Check server reachability via /api/tags
  try {
    const resp = await fetchWithTimeout(`${base}/api/tags`);
    if (!resp.ok) {
      result.error = `Ollama server returned ${resp.status}`;
      return result;
    }
    result.reachable = true;
  } catch (err) {
    result.error = `Ollama not reachable at ${base} — is it running? (${String(err)})`;
    log.warn(result.error);
    return result;
  }

  // 2. Check if model is available via /api/show
  try {
    const resp = await fetchWithTimeout(`${base}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
    });
    if (!resp.ok) {
      result.modelFound = false;
      result.error = `Model "${modelName}" not found — run: ollama pull ${modelName}`;
      log.warn(result.error);
      return result;
    }
    result.modelFound = true;
    const data = (await resp.json()) as {
      parameters?: string;
      model_info?: Record<string, unknown>;
    };

    // Try to extract context window from model info
    const contextKey = Object.keys(data.model_info ?? {}).find(
      (k) => k.includes("context_length") || k.includes("context_window"),
    );
    if (contextKey && data.model_info) {
      const ctxValue = data.model_info[contextKey];
      if (typeof ctxValue === "number") {
        result.contextWindow = ctxValue;
      }
    }
  } catch (err) {
    result.error = `Failed to query model info: ${String(err)}`;
    log.warn(result.error);
    return result;
  }

  // 3. Auto-upgrade context window if too small
  if (result.contextWindow && result.contextWindow < MIN_DESIRED_CONTEXT) {
    try {
      log.info(
        `Ollama model "${modelName}" context window is ${result.contextWindow}, upgrading to ${MIN_DESIRED_CONTEXT}...`,
      );
      await fetchWithTimeout(`${base}/api/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          from: modelName,
          params: { num_ctx: MIN_DESIRED_CONTEXT },
        }),
        timeoutMs: 30_000,
      });
      result.contextWindow = MIN_DESIRED_CONTEXT;
    } catch (err) {
      log.warn(`Failed to upgrade context window: ${String(err)}`);
    }
  }

  // 4. Pre-warm model into memory
  if (warmup) {
    try {
      log.info(`Warming up Ollama model "${modelName}"...`);
      await fetchWithTimeout(`${base}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelName,
          prompt: "",
          keep_alive: "24h",
        }),
        timeoutMs: 60_000,
      });
      result.warmedUp = true;
      log.info(`Ollama model "${modelName}" warmed up successfully`);
    } catch (err) {
      log.warn(`Ollama warmup failed (non-fatal): ${String(err)}`);
    }
  }

  return result;
}

// ── OpenAI-compatible (LM Studio, vLLM) ─────────────────────────────────────

async function checkOpenAICompat(params: {
  modelName: string;
  baseUrl?: string;
  serverLabel: string;
  log: Logger;
}): Promise<HealthCheckResult> {
  const { modelName, serverLabel, log } = params;
  const base = params.baseUrl ?? OPENAI_COMPAT_DEFAULT_BASE;
  const result: HealthCheckResult = {
    server: `${serverLabel} @ ${base}`,
    reachable: false,
    model: modelName,
  };

  // Check server + model via /v1/models
  try {
    const resp = await fetchWithTimeout(`${base}/v1/models`);
    if (!resp.ok) {
      result.error = `${serverLabel} returned ${resp.status}`;
      return result;
    }
    result.reachable = true;
    const data = (await resp.json()) as { data?: Array<{ id: string }> };
    const models = data.data ?? [];
    const found = models.some((m) => m.id === modelName || m.id.includes(modelName));
    result.modelFound = found;
    if (!found) {
      const available = models.map((m) => m.id).join(", ");
      result.error = `Model "${modelName}" not found. Available: ${available || "none"}`;
      log.warn(result.error);
    }
  } catch (err) {
    result.error = `${serverLabel} not reachable at ${base} — is it running? (${String(err)})`;
    log.warn(result.error);
  }

  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run health checks for all local models configured in the routing config.
 *
 * Non-blocking: always returns results, never throws. Gateway should still
 * start even if all checks fail (warn, don't block).
 */
export async function runModelHealthChecks(params: {
  routing?: AgentRoutingConfig;
  log: Logger;
}): Promise<HealthCheckResult[]> {
  const { routing, log } = params;
  if (!routing?.enabled) {
    return [];
  }

  const results: HealthCheckResult[] = [];
  const modelsToCheck = [routing.fastModel, routing.localModel].filter(Boolean);

  if (modelsToCheck.length === 0) {
    return [];
  }

  log.info(`Running health checks for ${modelsToCheck.length} local model(s)...`);

  for (const modelRef of modelsToCheck) {
    const parsed = parseModelRef(modelRef);
    if (!parsed) {
      continue;
    }

    const { provider, model } = parsed;

    try {
      if (provider === "ollama") {
        const result = await checkOllama({
          modelName: model,
          log,
        });
        results.push(result);
      } else if (provider === "lmstudio" || provider === "vllm" || provider === "openai-compat") {
        const result = await checkOpenAICompat({
          modelName: model,
          serverLabel: provider,
          log,
        });
        results.push(result);
      } else {
        // Not a local provider — skip health check
        log.info(`Skipping health check for non-local provider "${provider}/${model}"`);
      }
    } catch (err) {
      results.push({
        server: provider,
        reachable: false,
        model,
        error: `Unexpected error: ${String(err)}`,
      });
    }
  }

  // Summary
  const reachable = results.filter((r) => r.reachable).length;
  const found = results.filter((r) => r.modelFound).length;
  log.info(
    `Health check complete: ${reachable}/${results.length} servers reachable, ${found}/${results.length} models found`,
  );

  return results;
}
