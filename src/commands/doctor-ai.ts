/**
 * `doctor --ai` — AI-powered diagnostic explanation.
 *
 * Collects diagnostics, formats them into a prompt, sends to the cheapest
 * available model, and returns a natural-language explanation.
 *
 * @module
 */

import { CONFIG_PATH, readConfigFileSnapshot } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { logInfo, logError } from "../logger.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type DoctorAiResult = {
  diagnostics: string;
  analysis: string | null;
  model: string;
  error?: string;
};

// ── Diagnostic collection ────────────────────────────────────────────────────

async function collectDiagnosticBundle(): Promise<string> {
  const lines: string[] = [];
  lines.push("# OpenClaw Doctor Diagnostics\n");

  // 1. Config status
  try {
    const configSnapshot = await readConfigFileSnapshot();
    const cfg = configSnapshot.config;
    lines.push(`## Configuration`);
    lines.push(`Config path: ${CONFIG_PATH}`);
    lines.push(`Channels configured: ${Object.keys(cfg.channels ?? {}).length}`);
    lines.push(`Tools configured: ${Object.keys(cfg.tools ?? {}).length}`);
    lines.push(
      `Plugins: ${Array.isArray(cfg.plugins) ? cfg.plugins.length : "none"}`,
    );
  } catch (err) {
    lines.push(`## Configuration: Error reading config - ${err}`);
  }

  // 2. Environment
  lines.push(`\n## Environment`);
  lines.push(`Node: ${process.version}`);
  lines.push(`Platform: ${process.platform} ${process.arch}`);

  const relevantEnvVars = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_API_KEY",
    "BRAVE_API_KEY",
    "XAI_API_KEY",
    "OPENROUTER_API_KEY",
  ];
  for (const envVar of relevantEnvVars) {
    lines.push(`${envVar}: ${process.env[envVar] ? "set" : "not set"}`);
  }

  return lines.join("\n");
}

// ── AI analysis ──────────────────────────────────────────────────────────────

const DOCTOR_AI_SYSTEM_PROMPT = `You are OpenClaw's diagnostic assistant. Analyze the following diagnostic bundle and provide:

1. A brief health summary (1-2 sentences)
2. Any issues found, listed by severity (critical → warning → info)
3. Recommended fixes for each issue
4. Overall assessment

Be concise and actionable. Use plain language. If everything looks healthy, say so briefly.`;

/**
 * Run AI-powered diagnostics.
 *
 * Collects diagnostic info and returns the formatted bundle. When a gateway
 * endpoint is available, sends to the cheapest model for analysis.
 *
 * This is designed to work even when the gateway is down — it falls back
 * to returning raw diagnostics that the agent can interpret directly.
 */
export async function doctorAiCommand(
  runtime: RuntimeEnv = defaultRuntime,
): Promise<DoctorAiResult> {
  runtime.log("Collecting diagnostics...");
  const diagnostics = await collectDiagnosticBundle();

  // Try to find a gateway URL from config
  let gatewayUrl: string | undefined;
  let gatewayAuth: string | undefined;
  try {
    const configSnapshot = await readConfigFileSnapshot();
    const gw = configSnapshot.config.gateway;
    if (gw && typeof gw === "object" && "url" in gw && typeof gw.url === "string") {
      gatewayUrl = gw.url;
    }
    if (gw && typeof gw === "object" && "authToken" in gw && typeof gw.authToken === "string") {
      gatewayAuth = gw.authToken;
    }
  } catch {
    // Config read failed, will return raw diagnostics
  }

  if (!gatewayUrl) {
    runtime.log("\nNo gateway configured. Returning raw diagnostics.\n");
    runtime.log(diagnostics);
    return {
      diagnostics,
      analysis: null,
      model: "none",
      error: "No gateway configured. Diagnostics collected but AI analysis unavailable.",
    };
  }

  runtime.log("Sending to AI for analysis...");

  try {
    const endpoint = `${gatewayUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (gatewayAuth) {
      headers.Authorization = `Bearer ${gatewayAuth}`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "auto",
        messages: [
          { role: "system", content: DOCTOR_AI_SYSTEM_PROMPT },
          { role: "user", content: diagnostics },
        ],
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        diagnostics,
        analysis: null,
        model: "none",
        error: `AI analysis failed (${res.status}): ${text || res.statusText}`,
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const analysis = data.choices?.[0]?.message?.content ?? null;
    const model = data.model ?? "unknown";

    if (analysis) {
      runtime.log(`\n${analysis}`);
    }

    logInfo(`Doctor AI analysis completed using model: ${model}`);
    return { diagnostics, analysis, model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`Doctor AI failed: ${message}`);
    return {
      diagnostics,
      analysis: null,
      model: "none",
      error: `AI analysis failed: ${message}`,
    };
  }
}
