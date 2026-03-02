import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

const HEARTBEAT_LOG_FILENAME = "heartbeat-logs.txt";

type HeartbeatLogLevel = "silent" | "error" | "warn" | "info" | "debug";

function levelSeverity(level: string): number {
  switch (level) {
    case "debug":
      return 1;
    case "info":
      return 2;
    case "warn":
      return 3;
    case "error":
      return 4;
    default:
      return -1; // silent or unknown → never log
  }
}

function statusToLevel(status: string): HeartbeatLogLevel {
  switch (status) {
    case "failed":
      return "error";
    case "sent":
      return "info";
    case "ok-token":
    case "ok-empty":
    case "skipped":
      return "debug";
    default:
      return "info";
  }
}

function resolveHeartbeatLogPath(): string {
  const stateDir = resolveStateDir();
  return path.join(stateDir, "logs", HEARTBEAT_LOG_FILENAME);
}

/**
 * Append a single heartbeat run outcome to the heartbeat log file.
 * Respects the configured log level — events below the threshold are silently dropped.
 * Errors are swallowed (best-effort, never blocks heartbeat execution).
 */
export function writeHeartbeatLogEntry(params: {
  agentId: string;
  status: string;
  reason?: string;
  durationMs?: number;
  configuredLogLevel?: string;
}): void {
  const { agentId, status, reason, durationMs } = params;
  const configuredLevel = params.configuredLogLevel ?? "warn";

  if (configuredLevel === "silent") {
    return;
  }

  const entryLevel = statusToLevel(status);
  if (levelSeverity(entryLevel) < levelSeverity(configuredLevel)) {
    return;
  }

  try {
    const logPath = resolveHeartbeatLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
    const ts = new Date().toISOString();
    const parts = [`${ts} [${agentId}] status=${status}`];
    if (reason) {
      parts.push(`reason=${reason}`);
    }
    if (typeof durationMs === "number") {
      parts.push(`durationMs=${durationMs}`);
    }
    fs.appendFileSync(logPath, `${parts.join(" ")}\n`, { encoding: "utf-8" });
  } catch {
    // best-effort — never block heartbeat execution
  }
}
