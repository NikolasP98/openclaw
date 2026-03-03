/**
 * Provider circuit breaker — suspend providers after consecutive failures.
 *
 * 3-state per-provider health tracking:
 * - closed: healthy, requests flow normally
 * - open: suspended after N failures, requests rejected until cooldown
 * - half-open: cooldown elapsed, one probe request allowed
 *
 * Reuses the same pattern as cron/circuit-breaker.ts but scoped to
 * LLM provider health rather than cron jobs.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half-open";

export interface ProviderCircuitConfig {
  /** Consecutive failures before opening the circuit (default: 5). */
  maxFailures?: number;
  /** Cooldown period in ms before half-open probe (default: 60000). */
  cooldownMs?: number;
}

export interface ProviderHealthState {
  provider: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  suspendedAt?: number;
  resumeAt?: number;
  totalFailures: number;
  totalSuccesses: number;
}

// ── Implementation ───────────────────────────────────────────────────────────

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_COOLDOWN_MS = 60_000;

export class ProviderCircuitBreaker {
  private providers = new Map<string, ProviderHealthState>();
  private config: Required<ProviderCircuitConfig>;

  constructor(config?: ProviderCircuitConfig) {
    this.config = {
      maxFailures: config?.maxFailures ?? DEFAULT_MAX_FAILURES,
      cooldownMs: config?.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    };
  }

  /**
   * Check if a provider is healthy enough to receive requests.
   *
   * Returns true for closed (healthy) or half-open (probe).
   * Returns false for open (suspended).
   */
  canUse(provider: string): boolean {
    const state = this.getOrCreate(provider);

    if (state.state === "closed") {
      return true;
    }

    if (state.state === "open") {
      if (state.resumeAt && Date.now() >= state.resumeAt) {
        state.state = "half-open";
        return true;
      }
      return false;
    }

    // half-open: allow one probe
    return true;
  }

  /**
   * Record a successful request. Resets failure counter and closes circuit.
   */
  recordSuccess(provider: string): void {
    const state = this.getOrCreate(provider);
    state.consecutiveFailures = 0;
    state.state = "closed";
    state.lastSuccessAt = Date.now();
    state.suspendedAt = undefined;
    state.resumeAt = undefined;
    state.totalSuccesses++;
  }

  /**
   * Record a failed request.
   *
   * Returns true if the circuit just opened (newly suspended).
   */
  recordFailure(provider: string): boolean {
    const state = this.getOrCreate(provider);
    state.consecutiveFailures++;
    state.lastFailureAt = Date.now();
    state.totalFailures++;

    if (state.state === "half-open") {
      // Probe failed — back to open with fresh cooldown.
      state.state = "open";
      state.suspendedAt = Date.now();
      state.resumeAt = Date.now() + this.config.cooldownMs;
      return false;
    }

    if (state.consecutiveFailures >= this.config.maxFailures && state.state === "closed") {
      state.state = "open";
      state.suspendedAt = Date.now();
      state.resumeAt = Date.now() + this.config.cooldownMs;
      return true; // Newly suspended
    }

    return false;
  }

  /** Get the current health state of a provider. */
  getHealth(provider: string): ProviderHealthState {
    return { ...this.getOrCreate(provider) };
  }

  /** Get all suspended providers. */
  getSuspended(): ProviderHealthState[] {
    return [...this.providers.values()].filter((s) => s.state === "open").map((s) => ({ ...s }));
  }

  /** Get all tracked provider states. */
  allStates(): ProviderHealthState[] {
    return [...this.providers.values()].map((s) => ({ ...s }));
  }

  /** Manually reset a provider's circuit. */
  reset(provider: string): void {
    this.providers.delete(provider);
  }

  /** Reset all provider circuits. */
  resetAll(): void {
    this.providers.clear();
  }

  private getOrCreate(provider: string): ProviderHealthState {
    let state = this.providers.get(provider);
    if (!state) {
      state = {
        provider,
        state: "closed",
        consecutiveFailures: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      };
      this.providers.set(provider, state);
    }
    return state;
  }
}
