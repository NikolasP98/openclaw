/**
 * Fuzz test target 1: Command risk classification.
 *
 * Property: classifyCommandRisk never throws on any string input
 * and always returns a valid RiskAssessment.
 */
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { classifyCommandRisk, enforceAutonomy } from "./command-risk.js";
import type { AutonomyMode, RiskLevel } from "./command-risk.js";

const VALID_RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];
const VALID_AUTONOMY_MODES: AutonomyMode[] = ["readonly", "supervised", "full"];

describe("command-risk fuzz", () => {
  it("classifyCommandRisk never throws on arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = classifyCommandRisk(input);
        expect(VALID_RISK_LEVELS).toContain(result.level);
        expect(typeof result.trigger).toBe("string");
        expect(typeof result.reason).toBe("string");
        expect(typeof result.injectionDetected).toBe("boolean");
      }),
      { numRuns: 10_000 },
    );
  });

  it("enforceAutonomy never throws for any mode+command combination", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.constantFrom(...VALID_AUTONOMY_MODES),
        (command, mode) => {
          const decision = enforceAutonomy(command, mode);
          expect(typeof decision.allowed).toBe("boolean");
          expect(typeof decision.reason).toBe("string");
          expect(VALID_RISK_LEVELS).toContain(decision.risk.level);
        },
      ),
      { numRuns: 10_000 },
    );
  });

  it("readonly mode never allows medium or high risk commands", () => {
    fc.assert(
      fc.property(fc.string(), (command) => {
        const risk = classifyCommandRisk(command);
        const decision = enforceAutonomy(command, "readonly");
        if (risk.level !== "low") {
          expect(decision.allowed).toBe(false);
        }
      }),
      { numRuns: 5_000 },
    );
  });

  it("full mode always allows every command", () => {
    fc.assert(
      fc.property(fc.string(), (command) => {
        const decision = enforceAutonomy(command, "full");
        expect(decision.allowed).toBe(true);
      }),
      { numRuns: 5_000 },
    );
  });
});
