/**
 * Health dashboard — format agent health data for display.
 *
 * Renders health snapshots as Markdown tables for CLI, gateway UI,
 * or HEARTBEAT.md injection.
 *
 * @module
 */

import type { AgentHealthSnapshot } from "./agent-health-tracker.js";

// ── Formatting ───────────────────────────────────────────────────────────────

const STATUS_EMOJI: Record<AgentHealthSnapshot["status"], string> = {
  healthy: "✅",
  degraded: "⚠️",
  down: "❌",
};

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)}m`;
  }
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatTokens(count: number): string {
  if (count < 1000) {
    return String(count);
  }
  if (count < 1_000_000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return `${(count / 1_000_000).toFixed(1)}M`;
}

// ── Dashboard Renderers ──────────────────────────────────────────────────────

/**
 * Render health snapshots as a Markdown table.
 */
export function renderHealthTable(snapshots: AgentHealthSnapshot[]): string {
  if (snapshots.length === 0) {
    return "No agents tracked.";
  }

  const lines: string[] = [
    "| Agent | Status | Requests | Error% | Avg Latency | P95 Latency | Tokens (in/out) |",
    "|-------|--------|----------|--------|-------------|-------------|-----------------|",
  ];

  for (const s of snapshots) {
    const status = `${STATUS_EMOJI[s.status]} ${s.status}`;
    const tokens = `${formatTokens(s.totalInputTokens)}/${formatTokens(s.totalOutputTokens)}`;
    lines.push(
      `| ${s.agentId} | ${status} | ${s.totalRequests} | ${s.errorRate}% | ${formatDuration(s.avgLatencyMs)} | ${formatDuration(s.p95LatencyMs)} | ${tokens} |`,
    );
  }

  return lines.join("\n");
}

/**
 * Render a compact single-line summary for each agent.
 */
export function renderHealthSummary(snapshots: AgentHealthSnapshot[]): string {
  if (snapshots.length === 0) {
    return "No agents tracked.";
  }

  return snapshots
    .map((s) => {
      const status = STATUS_EMOJI[s.status];
      return `${status} ${s.agentId}: ${s.totalRequests} reqs, ${s.errorRate}% errors, ${formatDuration(s.avgLatencyMs)} avg, uptime ${formatDuration(s.uptimeMs)}`;
    })
    .join("\n");
}

/**
 * Render an alert summary — only unhealthy agents.
 *
 * Returns empty string if all agents are healthy.
 */
export function renderHealthAlerts(snapshots: AgentHealthSnapshot[]): string {
  const unhealthy = snapshots.filter((s) => s.status !== "healthy");
  if (unhealthy.length === 0) {
    return "";
  }

  const lines = [`## Agent Health Alerts (${unhealthy.length})`];
  for (const s of unhealthy) {
    const emoji = STATUS_EMOJI[s.status];
    lines.push(
      `- ${emoji} **${s.agentId}**: ${s.status} (${s.errorRate}% errors, ${s.totalErrors}/${s.totalRequests} failed)`,
    );
  }
  return lines.join("\n");
}
