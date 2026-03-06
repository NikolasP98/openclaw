import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

const TRACE_DIR_NAME = "traces";
const GATEWAY_SCOPE = "_gateway";
const MAX_AGE_DAYS = 7;

function resolveTraceDir(): string {
  return path.join(resolveStateDir(), "logs", TRACE_DIR_NAME);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Derive an 8-char trace ID from a message ID (or random fallback).
 */
export function deriveTraceId(messageId?: string | null): string {
  if (messageId && messageId.length >= 8) {
    return messageId.slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function formatTraceLine(traceId: string, stage: string, data?: Record<string, unknown>): string {
  const parts = [`${new Date().toISOString()} [${traceId}] ${stage}`];
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && value !== null && value !== "") {
        parts.push(`${key}=${formatValue(value)}`);
      }
    }
  }
  return parts.join(" ") + "\n";
}

function appendToScope(scope: string, line: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const dir = path.join(resolveTraceDir(), scope);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.appendFileSync(path.join(dir, `${today}.txt`), line, { encoding: "utf-8" });
}

/**
 * Append a trace event for a chat message lifecycle stage (agent scope).
 * Best-effort, never throws or blocks.
 */
export function traceChatEvent(params: {
  agentId: string;
  traceId: string;
  stage: string;
  data?: Record<string, unknown>;
}): void {
  try {
    const line = formatTraceLine(params.traceId, params.stage, params.data);
    appendToScope(params.agentId, line);
  } catch {
    // best-effort — never block message processing
  }
}

/**
 * Append a trace event to the gateway-level log (unified view across all agents).
 * Best-effort, never throws or blocks.
 */
export function traceGatewayEvent(params: {
  traceId: string;
  stage: string;
  data?: Record<string, unknown>;
}): void {
  try {
    const line = formatTraceLine(params.traceId, params.stage, params.data);
    appendToScope(GATEWAY_SCOPE, line);
  } catch {
    // best-effort
  }
}

/**
 * Remove trace files older than maxAgeDays. Call on gateway startup.
 */
export function pruneOldTraceFiles(maxAgeDays: number = MAX_AGE_DAYS): void {
  try {
    const traceDir = resolveTraceDir();
    if (!fs.existsSync(traceDir)) {
      return;
    }

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const agentDir of fs.readdirSync(traceDir)) {
      const agentPath = path.join(traceDir, agentDir);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(agentPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) {
        continue;
      }

      for (const file of fs.readdirSync(agentPath)) {
        if (!file.endsWith(".txt")) {
          continue;
        }
        const filePath = path.join(agentPath, file);
        try {
          const fileStat = fs.statSync(filePath);
          if (fileStat.mtimeMs < cutoff) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // ignore individual file errors
        }
      }

      // Remove empty agent directories
      try {
        const remaining = fs.readdirSync(agentPath);
        if (remaining.length === 0) {
          fs.rmdirSync(agentPath);
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // best-effort
  }
}
