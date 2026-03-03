/**
 * Fuzz test target 2: Shell lexer.
 *
 * Properties:
 * - tokenize never throws on any string input
 * - extractBaseCommand never throws on any string input
 * - detectInjection never throws on any string input
 * - tokenize output is always valid (non-empty commands, known operators)
 */
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { detectInjection, extractBaseCommand, tokenize } from "./shell-lexer.js";

const VALID_OPERATORS = new Set(["start", ";", "|", "&&", "||", "&"]);

describe("shell-lexer fuzz", () => {
  it("tokenize never throws on arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const tokens = tokenize(input);
        expect(Array.isArray(tokens)).toBe(true);
        for (const token of tokens) {
          expect(typeof token.command).toBe("string");
          expect(token.command.length).toBeGreaterThan(0);
          expect(VALID_OPERATORS.has(token.operator)).toBe(true);
        }
      }),
      { numRuns: 10_000 },
    );
  });

  it("extractBaseCommand never throws and always returns string", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = extractBaseCommand(input);
        expect(typeof result).toBe("string");
      }),
      { numRuns: 10_000 },
    );
  });

  it("detectInjection never throws and always returns boolean", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = detectInjection(input);
        expect(typeof result).toBe("boolean");
      }),
      { numRuns: 10_000 },
    );
  });

  it("tokenize preserves no empty commands in output", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const tokens = tokenize(input);
        for (const token of tokens) {
          expect(token.command.trim()).not.toBe("");
        }
      }),
      { numRuns: 5_000 },
    );
  });

  it("first token has operator 'start' when input starts with non-operator text", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          const t = s.trim();
          return t.length > 0 && !/^[;&|]/.test(t);
        }),
        (input) => {
          const tokens = tokenize(input);
          if (tokens.length > 0) {
            expect(tokens[0]!.operator).toBe("start");
          }
        },
      ),
      { numRuns: 5_000 },
    );
  });
});
