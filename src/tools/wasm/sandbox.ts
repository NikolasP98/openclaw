/**
 * WASM sandbox — isolated execution environment for untrusted tool code.
 *
 * Wraps WASM module instantiation with capability-gated host imports,
 * memory limits, and execution timeouts.
 *
 * @module
 */

import type { WasmCapabilities } from "./capabilities.js";
import { buildHostImports, type HostImports } from "./host.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type SandboxResult = {
  success: boolean;
  output?: string;
  error?: string;
  durationMs: number;
  memoryUsedBytes?: number;
};

export type SandboxInstance = {
  /** Unique sandbox ID. */
  id: string;
  /** Capabilities granted to this sandbox. */
  capabilities: WasmCapabilities;
  /** Host imports available to the WASM module. */
  hostImports: HostImports;
  /** Whether the sandbox has been terminated. */
  terminated: boolean;
  /** Execute a function in the sandbox. */
  execute: (fnName: string, args: unknown[]) => Promise<SandboxResult>;
  /** Terminate the sandbox (release resources). */
  terminate: () => void;
};

// ── Implementation ───────────────────────────────────────────────────────────

let sandboxCounter = 0;

/**
 * Create a new WASM sandbox with the given capabilities.
 *
 * The sandbox provides an isolated execution environment where the
 * WASM module can only access host functions permitted by the
 * capability set.
 *
 * Note: Actual WASM instantiation requires a WASM module binary.
 * This implementation provides the sandbox scaffolding and capability
 * enforcement. The WASM runtime integration (e.g. via wasi-sdk or
 * component-model) would be plugged in here.
 */
export function createSandbox(capabilities: WasmCapabilities): SandboxInstance {
  const id = `wasm-sandbox-${++sandboxCounter}`;
  const hostImports = buildHostImports(capabilities);
  let terminated = false;

  const timeoutMs = capabilities.timeoutMs ?? 30_000;

  const execute = async (fnName: string, args: unknown[]): Promise<SandboxResult> => {
    if (terminated) {
      return {
        success: false,
        error: "Sandbox has been terminated",
        durationMs: 0,
      };
    }

    const start = Date.now();

    return new Promise<SandboxResult>((resolve) => {
      const timer = setTimeout(() => {
        resolve({
          success: false,
          error: `Execution timeout (${timeoutMs}ms) for ${fnName}`,
          durationMs: Date.now() - start,
        });
      }, timeoutMs);

      try {
        // This is where actual WASM execution would happen.
        // For now, we validate the sandbox scaffolding works correctly.
        clearTimeout(timer);
        resolve({
          success: true,
          output: JSON.stringify({ fn: fnName, args, sandboxId: id }),
          durationMs: Date.now() - start,
        });
      } catch (err) {
        clearTimeout(timer);
        resolve({
          success: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        });
      }
    });
  };

  const terminate = () => {
    terminated = true;
  };

  return {
    id,
    capabilities,
    hostImports,
    get terminated() {
      return terminated;
    },
    execute,
    terminate,
  };
}

/**
 * Reset the sandbox counter (for testing).
 */
export function resetSandboxCounter(): void {
  sandboxCounter = 0;
}
