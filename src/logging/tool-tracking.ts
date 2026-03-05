import type { AnyAgentTool } from "../agents/tools/common.js";
import { trackSkillExecution, type SkillExecutionStatus } from "./reliability.js";

/**
 * Wrap an agent tool's `execute` method with duration/error tracking that
 * feeds into the existing `trackSkillExecution()` → hub metrics push pipeline.
 *
 * Tracking is best-effort: failures in the tracking code never affect tool
 * execution, and errors from the original execute are always re-thrown.
 */
export function wrapToolWithTracking(tool: AnyAgentTool, trackingName: string): AnyAgentTool {
  const originalExecute = tool.execute;

  tool.execute = async (toolCallId, params, signal?, onUpdate?) => {
    const startTime = Date.now();
    try {
      const result = await originalExecute.call(tool, toolCallId, params, signal, onUpdate);

      // Track success
      try {
        trackSkillExecution({
          skillName: trackingName,
          status: "ok",
          durationMs: Date.now() - startTime,
          occurredAt: startTime,
        });
      } catch {
        // Best effort — never break tool execution
      }

      return result;
    } catch (err) {
      // Classify the error
      let status: SkillExecutionStatus = "error";
      let errorMessage: string | undefined;

      try {
        // Check for abort/timeout
        if (signal?.aborted) {
          status = "timeout";
        } else {
          const errName =
            err && typeof err === "object" && "name" in err
              ? String((err as { name?: unknown }).name)
              : "";
          if (errName === "AbortError") {
            status = "timeout";
          } else {
            // Check for auth-related errors
            const msg = err instanceof Error ? err.message : String(err);
            errorMessage = msg.slice(0, 200);
            const lowerMsg = msg.toLowerCase();
            if (
              lowerMsg.includes("unauthorized") ||
              lowerMsg.includes("auth") ||
              lowerMsg.includes("401") ||
              lowerMsg.includes("forbidden")
            ) {
              status = "auth_error";
            }
          }
        }

        trackSkillExecution({
          skillName: trackingName,
          status,
          durationMs: Date.now() - startTime,
          errorMessage,
          occurredAt: startTime,
        });
      } catch {
        // Best effort — never break tool execution
      }

      throw err;
    }
  };

  return tool;
}
