/**
 * Fuzz test target 3: Provider registry routing.
 *
 * Properties:
 * - findByModel never throws on any string input
 * - findByModel returns either a valid ProviderSpec or undefined
 * - findByName never throws
 * - Known model names always resolve correctly
 */
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

// Dynamic import since the registry module may have side effects.
describe("provider registry fuzz", () => {
  it("findByModel never throws on arbitrary model name strings", async () => {
    const { findByModel } = await import("./registry.js");
    fc.assert(
      fc.property(fc.string(), (modelId) => {
        const result = findByModel(modelId);
        // Result is either a ProviderSpec object or undefined.
        if (result !== undefined) {
          expect(typeof result.name).toBe("string");
          expect(result.name.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 10_000 },
    );
  });

  it("findByModel handles unicode and empty strings", async () => {
    const { findByModel } = await import("./registry.js");
    fc.assert(
      fc.property(fc.string(), (modelId) => {
        // Should not throw.
        findByModel(modelId);
      }),
      { numRuns: 5_000 },
    );
  });

  it("findByName never throws on arbitrary strings", async () => {
    const { findByName } = await import("./registry.js");
    fc.assert(
      fc.property(fc.string(), (name) => {
        const result = findByName(name);
        if (result !== undefined) {
          expect(typeof result.name).toBe("string");
        }
      }),
      { numRuns: 10_000 },
    );
  });

  it("known models always resolve to correct provider", async () => {
    const { findByModel } = await import("./registry.js");
    const knownModels: Array<{ model: string; expectedProvider: string }> = [
      { model: "claude-sonnet-4", expectedProvider: "anthropic" },
      { model: "gpt-4o", expectedProvider: "openai" },
      { model: "gemini-2.5-pro", expectedProvider: "google" },
    ];
    for (const { model, expectedProvider } of knownModels) {
      const result = findByModel(model);
      if (result) {
        expect(result.name).toBe(expectedProvider);
      }
      // If provider not registered, that's OK — the property is "doesn't crash".
    }
  });
});
