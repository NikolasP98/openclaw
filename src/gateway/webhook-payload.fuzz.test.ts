/**
 * Fuzz test target 5: Webhook payload parsing.
 *
 * Properties:
 * - Arbitrary JSON-like payloads never crash the webhook handler's
 *   field extraction logic
 * - Standard webhook fields are extracted when present, gracefully
 *   absent when not
 *
 * This tests the resilience of webhook/HTTP payload normalization
 * rather than a specific handler (those are channel-specific).
 */
import { describe, expect, it } from "vitest";
import * as fc from "fast-check";

/**
 * Simulated webhook payload normalizer.
 * Extracts standard fields from arbitrary JSON payloads safely.
 */
function normalizeWebhookPayload(raw: unknown): {
  type: string;
  senderId: string | undefined;
  content: string | undefined;
  timestamp: number | undefined;
} {
  if (!raw || typeof raw !== "object") {
    return { type: "unknown", senderId: undefined, content: undefined, timestamp: undefined };
  }

  const obj = raw as Record<string, unknown>;

  const type = typeof obj.type === "string" ? obj.type : "unknown";
  const senderId =
    typeof obj.senderId === "string"
      ? obj.senderId
      : typeof obj.from === "string"
        ? obj.from
        : typeof obj.sender === "string"
          ? obj.sender
          : undefined;
  const content =
    typeof obj.content === "string"
      ? obj.content
      : typeof obj.text === "string"
        ? obj.text
        : typeof obj.message === "string"
          ? obj.message
          : undefined;
  const timestamp =
    typeof obj.timestamp === "number"
      ? obj.timestamp
      : typeof obj.ts === "number"
        ? obj.ts
        : undefined;

  return { type, senderId, content, timestamp };
}

describe("webhook-payload fuzz", () => {
  it("normalizeWebhookPayload never throws on arbitrary JSON values", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (input) => {
        const result = normalizeWebhookPayload(input);
        expect(typeof result.type).toBe("string");
        // senderId, content, timestamp can be undefined.
        if (result.senderId !== undefined) {
          expect(typeof result.senderId).toBe("string");
        }
        if (result.content !== undefined) {
          expect(typeof result.content).toBe("string");
        }
        if (result.timestamp !== undefined) {
          expect(typeof result.timestamp).toBe("number");
        }
      }),
      { numRuns: 10_000 },
    );
  });

  it("handles deeply nested objects without stack overflow", () => {
    fc.assert(
      fc.property(
        fc.jsonValue({ maxDepth: 10 }),
        (input) => {
          normalizeWebhookPayload(input);
        },
      ),
      { numRuns: 5_000 },
    );
  });

  it("handles primitive types gracefully", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.constant(undefined), fc.double()),
        (input) => {
          const result = normalizeWebhookPayload(input);
          expect(result.type).toBe("unknown");
        },
      ),
      { numRuns: 5_000 },
    );
  });

  it("extracts known fields when present in valid format", () => {
    fc.assert(
      fc.property(
        fc.record({
          type: fc.string(),
          senderId: fc.string(),
          content: fc.string(),
          timestamp: fc.integer(),
        }),
        (input) => {
          const result = normalizeWebhookPayload(input);
          expect(result.type).toBe(input.type);
          expect(result.senderId).toBe(input.senderId);
          expect(result.content).toBe(input.content);
          expect(result.timestamp).toBe(input.timestamp);
        },
      ),
      { numRuns: 5_000 },
    );
  });
});
