/**
 * WASM sandbox capabilities — permission model for isolated tool execution.
 *
 * Defines what a WASM-sandboxed tool is allowed to access: filesystem paths,
 * network hosts, environment variables, and resource limits.
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type WasmCapability =
  | "fs:read"
  | "fs:write"
  | "net:fetch"
  | "env:read"
  | "clock:now"
  | "random";

export type WasmCapabilities = {
  /** Allowed capabilities. */
  allow: Set<WasmCapability>;
  /** Allowed filesystem read paths (glob patterns). */
  fsReadPaths?: string[];
  /** Allowed filesystem write paths (glob patterns). */
  fsWritePaths?: string[];
  /** Allowed network hosts for fetch. */
  netHosts?: string[];
  /** Allowed environment variable names. */
  envVars?: string[];
  /** Memory limit in bytes (default: 64MB). */
  memoryLimitBytes?: number;
  /** Execution timeout in ms (default: 30000). */
  timeoutMs?: number;
};

// ── Presets ──────────────────────────────────────────────────────────────────

const DEFAULT_MEMORY_LIMIT = 64 * 1024 * 1024; // 64MB
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Minimal sandbox — no I/O, only computation.
 */
export function minimalCapabilities(): WasmCapabilities {
  return {
    allow: new Set(["clock:now", "random"]),
    memoryLimitBytes: DEFAULT_MEMORY_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Read-only sandbox — can read specific filesystem paths, no writes or network.
 */
export function readOnlyCapabilities(readPaths: string[]): WasmCapabilities {
  return {
    allow: new Set(["fs:read", "clock:now", "random"]),
    fsReadPaths: readPaths,
    memoryLimitBytes: DEFAULT_MEMORY_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Network sandbox — can fetch from specific hosts, no filesystem.
 */
export function networkCapabilities(hosts: string[]): WasmCapabilities {
  return {
    allow: new Set(["net:fetch", "clock:now", "random"]),
    netHosts: hosts,
    memoryLimitBytes: DEFAULT_MEMORY_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Full sandbox — all capabilities with specified paths/hosts.
 */
export function fullCapabilities(params: {
  readPaths?: string[];
  writePaths?: string[];
  hosts?: string[];
  envVars?: string[];
}): WasmCapabilities {
  return {
    allow: new Set(["fs:read", "fs:write", "net:fetch", "env:read", "clock:now", "random"]),
    fsReadPaths: params.readPaths,
    fsWritePaths: params.writePaths,
    netHosts: params.hosts,
    envVars: params.envVars,
    memoryLimitBytes: DEFAULT_MEMORY_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Check if a capability is allowed.
 */
export function hasCapability(caps: WasmCapabilities, cap: WasmCapability): boolean {
  return caps.allow.has(cap);
}

/**
 * Check if a filesystem read path is allowed.
 */
export function canReadPath(caps: WasmCapabilities, filePath: string): boolean {
  if (!hasCapability(caps, "fs:read")) {
    return false;
  }
  if (!caps.fsReadPaths || caps.fsReadPaths.length === 0) {
    return false;
  }
  return caps.fsReadPaths.some((pattern) => matchPathPattern(filePath, pattern));
}

/**
 * Check if a filesystem write path is allowed.
 */
export function canWritePath(caps: WasmCapabilities, filePath: string): boolean {
  if (!hasCapability(caps, "fs:write")) {
    return false;
  }
  if (!caps.fsWritePaths || caps.fsWritePaths.length === 0) {
    return false;
  }
  return caps.fsWritePaths.some((pattern) => matchPathPattern(filePath, pattern));
}

/**
 * Check if a network host is allowed.
 */
export function canFetchHost(caps: WasmCapabilities, host: string): boolean {
  if (!hasCapability(caps, "net:fetch")) {
    return false;
  }
  if (!caps.netHosts || caps.netHosts.length === 0) {
    return false;
  }
  const lower = host.toLowerCase();
  return caps.netHosts.some(
    (h) => lower === h.toLowerCase() || lower.endsWith("." + h.toLowerCase()),
  );
}

/**
 * Simple path pattern matching (prefix-based with /** glob).
 */
function matchPathPattern(filePath: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return filePath.startsWith(prefix);
  }
  return filePath === pattern || filePath.startsWith(pattern + "/");
}
