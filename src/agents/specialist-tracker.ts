import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Specialist performance metrics for a single agent.
 */
export type SpecialistMetrics = {
  agentId: string;
  activeJobs: number;
  totalJobsCompleted: number;
  totalJobsFailed: number;
  avgResponseTimeMs: number;
  successRate: number;
  lastActivity: number; // timestamp
};

/**
 * Job tracking record for calculating metrics.
 */
type JobRecord = {
  runId: string;
  agentId: string;
  startedAt: number;
  endedAt?: number;
  success?: boolean;
};

/**
 * In-memory tracking of active jobs and historical performance.
 */
class SpecialistTracker {
  private activeJobs = new Map<string, JobRecord>(); // runId -> JobRecord
  private metrics = new Map<string, SpecialistMetrics>(); // agentId -> metrics
  private persistPath: string;
  private persistDebounceTimer: NodeJS.Timeout | null = null;
  private readonly PERSIST_DEBOUNCE_MS = 5000;

  constructor() {
    const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
    this.persistPath = path.join(stateDir, "specialist-metrics.json");
    void this.loadMetrics();
  }

  /**
   * Load metrics from disk on startup.
   */
  private async loadMetrics(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath, "utf-8");
      const parsed = JSON.parse(data) as Record<string, SpecialistMetrics>;
      for (const [agentId, metrics] of Object.entries(parsed)) {
        // Reset activeJobs on startup (previous session may have crashed)
        metrics.activeJobs = 0;
        this.metrics.set(agentId, metrics);
      }
    } catch {
      // File doesn't exist or parse error - start fresh
    }
  }

  /**
   * Persist metrics to disk (debounced to avoid excessive writes).
   */
  private schedulePersist(): void {
    if (this.persistDebounceTimer) {
      clearTimeout(this.persistDebounceTimer);
    }
    this.persistDebounceTimer = setTimeout(() => {
      void this.persistMetrics();
      this.persistDebounceTimer = null;
    }, this.PERSIST_DEBOUNCE_MS);
  }

  /**
   * Write metrics to disk immediately.
   */
  private async persistMetrics(): Promise<void> {
    try {
      const obj: Record<string, SpecialistMetrics> = {};
      for (const [agentId, metrics] of this.metrics.entries()) {
        obj[agentId] = metrics;
      }
      await fs.writeFile(this.persistPath, JSON.stringify(obj, null, 2), "utf-8");
    } catch {
      // Ignore persistence failures
    }
  }

  /**
   * Track a new subagent job spawning.
   */
  trackSpawn(runId: string, agentId: string): void {
    const now = Date.now();
    this.activeJobs.set(runId, {
      runId,
      agentId,
      startedAt: now,
    });

    // Initialize metrics if not exists
    if (!this.metrics.has(agentId)) {
      this.metrics.set(agentId, {
        agentId,
        activeJobs: 0,
        totalJobsCompleted: 0,
        totalJobsFailed: 0,
        avgResponseTimeMs: 0,
        successRate: 0,
        lastActivity: now,
      });
    }

    const metrics = this.metrics.get(agentId)!;
    metrics.activeJobs += 1;
    metrics.lastActivity = now;

    this.schedulePersist();
  }

  /**
   * Track a subagent job completion.
   */
  trackComplete(runId: string, success: boolean): void {
    const job = this.activeJobs.get(runId);
    if (!job) {
      return; // Job wasn't tracked (maybe from previous session)
    }

    const now = Date.now();
    job.endedAt = now;
    job.success = success;

    const metrics = this.metrics.get(job.agentId);
    if (!metrics) {
      return; // Should not happen
    }

    // Update metrics
    metrics.activeJobs = Math.max(0, metrics.activeJobs - 1);
    metrics.lastActivity = now;

    if (success) {
      metrics.totalJobsCompleted += 1;
    } else {
      metrics.totalJobsFailed += 1;
    }

    // Calculate new average response time
    const duration = now - job.startedAt;
    const totalJobs = metrics.totalJobsCompleted + metrics.totalJobsFailed;
    if (totalJobs === 1) {
      // First job
      metrics.avgResponseTimeMs = duration;
    } else {
      // Running average
      metrics.avgResponseTimeMs =
        (metrics.avgResponseTimeMs * (totalJobs - 1) + duration) / totalJobs;
    }

    // Calculate success rate
    metrics.successRate = metrics.totalJobsCompleted / totalJobs;

    // Remove from active tracking
    this.activeJobs.delete(runId);

    this.schedulePersist();
  }

  /**
   * Get metrics for a specific specialist.
   */
  getMetrics(agentId: string): SpecialistMetrics | null {
    return this.metrics.get(agentId) || null;
  }

  /**
   * Get metrics for all specialists.
   */
  getAllMetrics(): SpecialistMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Reset metrics for a specialist (useful for testing).
   */
  resetMetrics(agentId: string): void {
    this.metrics.delete(agentId);
    this.schedulePersist();
  }

  /**
   * Get current active jobs count for a specialist.
   */
  getActiveJobsCount(agentId: string): number {
    return this.metrics.get(agentId)?.activeJobs || 0;
  }

  /**
   * Find least-loaded specialist from a list of candidate agentIds.
   * Useful for load balancing when multiple specialists can handle a task.
   */
  findLeastLoaded(candidateAgentIds: string[]): string | null {
    if (candidateAgentIds.length === 0) {
      return null;
    }
    if (candidateAgentIds.length === 1) {
      return candidateAgentIds[0];
    }

    let minLoad = Infinity;
    let selected: string | null = null;

    for (const agentId of candidateAgentIds) {
      const load = this.getActiveJobsCount(agentId);
      if (load < minLoad) {
        minLoad = load;
        selected = agentId;
      }
    }

    return selected || candidateAgentIds[0];
  }
}

// Singleton instance
const tracker = new SpecialistTracker();

/**
 * Track a subagent spawn.
 */
export function trackSpecialistSpawn(runId: string, agentId: string): void {
  tracker.trackSpawn(runId, agentId);
}

/**
 * Track a subagent completion.
 */
export function trackSpecialistComplete(runId: string, success: boolean): void {
  tracker.trackComplete(runId, success);
}

/**
 * Get metrics for a specific specialist.
 */
export function getSpecialistMetrics(agentId: string): SpecialistMetrics | null {
  return tracker.getMetrics(agentId);
}

/**
 * Get metrics for all specialists.
 */
export function getAllSpecialistMetrics(): SpecialistMetrics[] {
  return tracker.getAllMetrics();
}

/**
 * Reset metrics for a specialist.
 */
export function resetSpecialistMetrics(agentId: string): void {
  tracker.resetMetrics(agentId);
}

/**
 * Get active jobs count for a specialist.
 */
export function getSpecialistActiveJobs(agentId: string): number {
  return tracker.getActiveJobsCount(agentId);
}

/**
 * Find the least-loaded specialist from candidates.
 */
export function findLeastLoadedSpecialist(candidateAgentIds: string[]): string | null {
  return tracker.findLeastLoaded(candidateAgentIds);
}
