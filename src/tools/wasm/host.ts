/**
 * WASM host — host-side functions exposed to sandboxed WASM modules.
 *
 * Implements the host imports that WASM tools can call, filtered by
 * the capabilities granted to the sandbox.
 *
 * @module
 */

import type { WasmCapabilities } from "./capabilities.js";
import { canFetchHost, canReadPath, canWritePath, hasCapability } from "./capabilities.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type HostCallResult = {
  success: boolean;
  data?: string;
  error?: string;
};

export type HostImports = {
  fs_read: (path: string) => HostCallResult;
  fs_write: (path: string, data: string) => HostCallResult;
  net_fetch: (url: string) => HostCallResult;
  env_get: (name: string) => HostCallResult;
  clock_now: () => number;
  random_bytes: (length: number) => Uint8Array;
};

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Build host import functions filtered by sandbox capabilities.
 *
 * Returns a HostImports object where disallowed operations return
 * error results rather than throwing.
 */
export function buildHostImports(caps: WasmCapabilities): HostImports {
  return {
    fs_read(filePath: string): HostCallResult {
      if (!canReadPath(caps, filePath)) {
        return { success: false, error: `Read not permitted: ${filePath}` };
      }
      // Actual filesystem read would be implemented here with node:fs.
      // For now, return a placeholder indicating the path was validated.
      return { success: true, data: `[fs_read:${filePath}]` };
    },

    fs_write(filePath: string, _data: string): HostCallResult {
      if (!canWritePath(caps, filePath)) {
        return { success: false, error: `Write not permitted: ${filePath}` };
      }
      return { success: true };
    },

    net_fetch(url: string): HostCallResult {
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        return { success: false, error: `Invalid URL: ${url}` };
      }
      if (!canFetchHost(caps, host)) {
        return { success: false, error: `Fetch not permitted for host: ${host}` };
      }
      return { success: true, data: `[net_fetch:${url}]` };
    },

    env_get(name: string): HostCallResult {
      if (!hasCapability(caps, "env:read")) {
        return { success: false, error: "Environment access not permitted" };
      }
      if (caps.envVars && !caps.envVars.includes(name)) {
        return { success: false, error: `Environment variable not allowed: ${name}` };
      }
      const value = process.env[name];
      return value !== undefined
        ? { success: true, data: value }
        : { success: false, error: `Environment variable not set: ${name}` };
    },

    clock_now(): number {
      if (!hasCapability(caps, "clock:now")) {
        return 0;
      }
      return Date.now();
    },

    random_bytes(length: number): Uint8Array {
      if (!hasCapability(caps, "random")) {
        return new Uint8Array(length);
      }
      const bytes = new Uint8Array(length);
      crypto.getRandomValues(bytes);
      return bytes;
    },
  };
}
