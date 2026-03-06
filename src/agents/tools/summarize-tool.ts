/**
 * summarize tool - Summarize URLs, YouTube videos, and local files via the summarize CLI
 */

import { Type } from "@sinclair/typebox";
import { runCommandWithTimeout } from "../../platform/process/exec.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const SummarizeSchema = Type.Object({
  url: Type.String({
    description:
      "URL or local file path to summarize. Supports http/https URLs, YouTube links, and absolute file paths (PDF, audio, video, text).",
    minLength: 1,
  }),
  youtube: Type.Optional(
    Type.Union([Type.Literal("auto"), Type.Literal("transcript")], {
      description:
        'YouTube extraction mode. "auto" uses the best available method (transcript or Apify fallback). "transcript" extracts transcript only without summarizing.',
    }),
  ),
  length: Type.Optional(
    Type.String({
      description:
        'Output length: "short", "medium" (default), "long", "xl", "xxl", or a character count like "2000".',
    }),
  ),
  extract_only: Type.Optional(
    Type.Boolean({
      description:
        "Extract raw content only (no AI summarization). Useful for getting the full transcript before deciding what to summarize.",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({
      description: "Timeout in seconds (default: 120, max: 300)",
      minimum: 10,
      maximum: 300,
    }),
  ),
});

export function createSummarizeTool(): AnyAgentTool {
  return {
    label: "Summarize",
    name: "summarize",
    description:
      "Summarize URLs, YouTube videos, podcasts, and local files (PDF, audio, video, text). Use for any request to summarize or transcribe a link or file.",
    parameters: SummarizeSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const url = readStringParam(params, "url", { required: true });
      const timeoutSec = Math.min((params.timeout as number) || 120, 300);

      // Check binary availability
      const check = await runCommandWithTimeout(["which", "summarize"], { timeoutMs: 3_000 });
      if (check.code !== 0) {
        return jsonResult({
          error: "summarize CLI is not installed. Install via: brew install steipete/tap/summarize",
        });
      }

      const cmd: string[] = ["summarize", url];

      if (params.youtube === "auto" || params.youtube === "transcript") {
        cmd.push("--youtube", "auto");
      }
      if (params.extract_only === true) {
        cmd.push("--extract-only");
      }
      if (typeof params.length === "string" && params.length.trim()) {
        cmd.push("--length", params.length.trim());
      }

      const result = await runCommandWithTimeout(cmd, { timeoutMs: timeoutSec * 1000 });

      if (result.killed || result.termination === "timeout") {
        return jsonResult({
          error: `summarize timed out after ${timeoutSec}s`,
          partial: result.stdout.slice(0, 3000) || undefined,
        });
      }

      if (result.code !== 0) {
        return jsonResult({
          error: `summarize exited with code ${result.code}`,
          stderr: result.stderr.slice(0, 1000) || undefined,
        });
      }

      return jsonResult({ result: result.stdout });
    },
  };
}
