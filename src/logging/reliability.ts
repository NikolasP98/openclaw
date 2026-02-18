import type {
  ReliabilityEvent,
  ReliabilityEventInput,
} from "../gateway/protocol/schema/reliability.js";
import { emitDiagnosticEvent } from "../infra/diagnostic-events.js";
import { ReliabilityRingBuffer } from "./reliability-buffer.js";
import { createSubsystemLogger } from "./subsystem.js";

const log = createSubsystemLogger("reliability");

export const reliabilityBuffer = new ReliabilityRingBuffer(1000);

let broadcastFn:
  | ((event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void)
  | null = null;

const startedAtMs = Date.now();

/**
 * Call once at gateway startup to wire the broadcast function.
 */
export function initReliability(
  broadcast: (event: string, payload: unknown, opts?: { dropIfSlow?: boolean }) => void,
): void {
  broadcastFn = broadcast;
}

/**
 * Emit a reliability event. Enriches with timestamp, stores in ring buffer,
 * broadcasts to connected clients, and forwards to the diagnostic event system.
 */
export function emitReliabilityEvent(input: ReliabilityEventInput): void {
  const event: ReliabilityEvent = {
    ...input,
    timestamp: Date.now(),
  };

  reliabilityBuffer.push(event);

  if (broadcastFn) {
    broadcastFn("reliability", event, { dropIfSlow: true });
  }

  // Also emit as a diagnostic event for log correlation
  emitDiagnosticEvent({
    type: "webhook.received", // piggyback on existing type to avoid breaking DiagnosticEventPayload union
    channel: `reliability:${event.category}`,
    updateType: event.event,
  });

  if (event.severity === "critical" || event.severity === "high") {
    log.warn(`[${event.category}] ${event.event}: ${event.message}`);
  } else {
    log.debug(`[${event.category}] ${event.event}: ${event.message}`);
  }
}

/**
 * Return the epoch ms when the gateway (and thus the buffer) started.
 */
export function getReliabilityUptimeStartMs(): number {
  return startedAtMs;
}
