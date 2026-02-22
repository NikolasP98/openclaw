import { describe, expect, it } from "vitest";
import { AgentHealthTracker } from "./agent-health-tracker.js";
import { renderHealthAlerts, renderHealthSummary, renderHealthTable } from "./dashboard.js";

describe("AgentHealthTracker", () => {
  it("starts with healthy status and zero metrics", () => {
    const tracker = new AgentHealthTracker();
    const snap = tracker.getSnapshot("main");
    expect(snap.status).toBe("healthy");
    expect(snap.totalRequests).toBe(0);
    expect(snap.errorRate).toBe(0);
  });

  it("records successes with latency and tokens", () => {
    const tracker = new AgentHealthTracker();
    tracker.recordSuccess("main", 100, { input: 500, output: 200 });
    tracker.recordSuccess("main", 200, { input: 300, output: 100 });

    const snap = tracker.getSnapshot("main");
    expect(snap.totalRequests).toBe(2);
    expect(snap.totalErrors).toBe(0);
    expect(snap.avgLatencyMs).toBe(150);
    expect(snap.totalInputTokens).toBe(800);
    expect(snap.totalOutputTokens).toBe(300);
    expect(snap.lastSuccessAt).toBeGreaterThan(0);
  });

  it("records errors and computes error rate", () => {
    const tracker = new AgentHealthTracker();
    tracker.recordSuccess("main", 100);
    tracker.recordError("main", 50);

    const snap = tracker.getSnapshot("main");
    expect(snap.totalRequests).toBe(2);
    expect(snap.totalErrors).toBe(1);
    expect(snap.errorRate).toBe(50);
    expect(snap.lastErrorAt).toBeGreaterThan(0);
  });

  it("marks agent as degraded when error rate exceeds threshold", () => {
    const tracker = new AgentHealthTracker({ degradedErrorRate: 10, downErrorRate: 50 });
    // 8 successes + 2 errors = 20% error rate → degraded
    for (let i = 0; i < 8; i++) {
      tracker.recordSuccess("main", 100);
    }
    for (let i = 0; i < 2; i++) {
      tracker.recordError("main");
    }

    expect(tracker.getSnapshot("main").status).toBe("degraded");
  });

  it("marks agent as down when error rate exceeds down threshold", () => {
    const tracker = new AgentHealthTracker({ degradedErrorRate: 10, downErrorRate: 50 });
    // 2 successes + 3 errors = 60% error rate → down
    for (let i = 0; i < 2; i++) {
      tracker.recordSuccess("main", 100);
    }
    for (let i = 0; i < 3; i++) {
      tracker.recordError("main");
    }

    expect(tracker.getSnapshot("main").status).toBe("down");
  });

  it("computes p95 latency", () => {
    const tracker = new AgentHealthTracker();
    // 100 samples: 94 at 100ms, 6 at 500ms
    // p95 index = ceil(100*0.95)-1 = 94. sorted[94] = 500
    for (let i = 0; i < 94; i++) {
      tracker.recordSuccess("main", 100);
    }
    for (let i = 0; i < 6; i++) {
      tracker.recordSuccess("main", 500);
    }

    const snap = tracker.getSnapshot("main");
    expect(snap.p95LatencyMs).toBe(500);
  });

  it("tracks multiple agents independently", () => {
    const tracker = new AgentHealthTracker();
    tracker.recordSuccess("agent-a", 100);
    tracker.recordError("agent-b");

    expect(tracker.getSnapshot("agent-a").totalErrors).toBe(0);
    expect(tracker.getSnapshot("agent-b").totalErrors).toBe(1);
  });

  it("allSnapshots returns all tracked agents", () => {
    const tracker = new AgentHealthTracker();
    tracker.recordSuccess("a", 100);
    tracker.recordSuccess("b", 200);

    const snaps = tracker.allSnapshots();
    expect(snaps).toHaveLength(2);
    expect(snaps.map((s) => s.agentId).toSorted()).toEqual(["a", "b"]);
  });

  it("unhealthyAgents returns only non-healthy", () => {
    const tracker = new AgentHealthTracker({ degradedErrorRate: 10, downErrorRate: 50 });
    tracker.recordSuccess("healthy-agent", 100);
    for (let i = 0; i < 5; i++) {
      tracker.recordError("sick-agent");
    }

    expect(tracker.unhealthyAgents()).toEqual(["sick-agent"]);
  });

  it("reset clears agent metrics", () => {
    const tracker = new AgentHealthTracker();
    tracker.recordSuccess("main", 100);
    tracker.reset("main");
    expect(tracker.getSnapshot("main").totalRequests).toBe(0);
  });

  it("resetAll clears all", () => {
    const tracker = new AgentHealthTracker();
    tracker.recordSuccess("a", 100);
    tracker.recordSuccess("b", 100);
    tracker.resetAll();
    expect(tracker.allSnapshots()).toHaveLength(0);
  });
});

describe("dashboard rendering", () => {
  const tracker = new AgentHealthTracker({ degradedErrorRate: 10, downErrorRate: 50 });

  function makeSnapshots() {
    tracker.resetAll();
    for (let i = 0; i < 10; i++) {
      tracker.recordSuccess("main", 150, { input: 1000, output: 500 });
    }
    tracker.recordSuccess("helper", 50);
    for (let i = 0; i < 5; i++) {
      tracker.recordError("broken");
    }
    return tracker.allSnapshots();
  }

  it("renderHealthTable produces markdown table", () => {
    const table = renderHealthTable(makeSnapshots());
    expect(table).toContain("| Agent |");
    expect(table).toContain("main");
    expect(table).toContain("helper");
    expect(table).toContain("broken");
  });

  it("renderHealthTable handles empty snapshots", () => {
    expect(renderHealthTable([])).toBe("No agents tracked.");
  });

  it("renderHealthSummary produces one line per agent", () => {
    const summary = renderHealthSummary(makeSnapshots());
    const lines = summary.split("\n");
    expect(lines).toHaveLength(3);
    expect(summary).toContain("main");
  });

  it("renderHealthAlerts only shows unhealthy", () => {
    const alerts = renderHealthAlerts(makeSnapshots());
    expect(alerts).toContain("broken");
    expect(alerts).not.toContain("main");
    expect(alerts).not.toContain("helper");
  });

  it("renderHealthAlerts returns empty for all healthy", () => {
    tracker.resetAll();
    tracker.recordSuccess("main", 100);
    expect(renderHealthAlerts(tracker.allSnapshots())).toBe("");
  });
});
