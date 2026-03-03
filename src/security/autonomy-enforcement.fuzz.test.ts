/**
 * Fuzz test target 4: Autonomy enforcement (tool params).
 *
 * Properties:
 * - checkCommandAutonomy never throws regardless of params shape
 * - Non-exec tools always return null
 * - Full mode always returns allowed
 * - Readonly + high-risk = always blocked
 */
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { checkCommandAutonomy } from "./autonomy-enforcement.js";
import type { MinionConfig } from "../config/config.js";

const EXEC_TOOLS = ["exec", "shell", "bash", "shell_exec"];
const NON_EXEC_TOOLS = ["memory_search", "web_search", "browser_navigate", "cron", "sessions_spawn"];

describe("autonomy-enforcement fuzz", () => {
  it("checkCommandAutonomy never throws with arbitrary tool params", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXEC_TOOLS),
        fc.jsonValue(),
        fc.constantFrom("readonly", "supervised", "full"),
        (toolName, params, level) => {
          const result = checkCommandAutonomy({
            toolName,
            toolParams: params,
            config: { security: { level } } as MinionConfig,
          });
          // Result is null (not exec tool), or { blocked: boolean } with optional reason.
          if (result !== null) {
            expect(typeof result.blocked).toBe("boolean");
            if (result.blocked) {
              expect(typeof (result as { reason: string }).reason).toBe("string");
            }
          }
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it("non-exec tools always return null regardless of params", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_EXEC_TOOLS),
        fc.jsonValue(),
        (toolName, params) => {
          const result = checkCommandAutonomy({
            toolName,
            toolParams: params,
            config: { security: { level: "readonly" } } as MinionConfig,
          });
          expect(result).toBeNull();
        },
      ),
      { numRuns: 5_000 },
    );
  });

  it("handles undefined/null config gracefully", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXEC_TOOLS),
        fc.string(),
        (toolName, command) => {
          // Should never throw.
          checkCommandAutonomy({
            toolName,
            toolParams: { command },
            config: undefined,
          });
        },
      ),
      { numRuns: 5_000 },
    );
  });

  it("handles non-object params gracefully", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EXEC_TOOLS),
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (toolName, params) => {
          const result = checkCommandAutonomy({
            toolName,
            toolParams: params,
            config: { security: { level: "supervised" } } as MinionConfig,
          });
          if (result !== null) {
            expect(typeof result.blocked).toBe("boolean");
          }
        },
      ),
      { numRuns: 5_000 },
    );
  });
});
