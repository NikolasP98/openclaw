/**
 * Memory compaction queue — background async job for typed memory maintenance.
 *
 * Three phases (run sequentially, never overlap):
 *   1. Prune   — delete expired objects (past TTL)
 *   2. Infer   — lightweight LLM call to surface new relationships (debounced ≥5min)
 *   3. Dedupe  — merge near-duplicate Entity objects by label similarity
 *
 * Runs in the same Node process — no IPC, no worker threads.
 * All phases are wrapped in try/catch; errors are logged but never crash the process.
 *
 * @module
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { ObjectType } from "../typed-schema.js";

// ── Types ──────────────────────────────────────────────────────────────────────

export type InferFn = (interactions: Array<{ id: string; label: string }>) => Promise<
  Array<{
    fromId: string;
    toId: string;
    relType: "related_to" | "caused_by" | "part_of" | "precedes" | "contradicts";
    weight?: number;
  }>
>;

export type CompactorDeps = {
  /**
   * Prune TTL-expired objects. Returns count of deleted rows.
   * Defaults to the real pruneExpiredObjects() from typed-schema.
   */
  prune?: () => number;
  /**
   * List objects of a given type (used to gather Interactions for inference).
   * Defaults to the real listObjectsByType() from typed-schema.
   */
  listByType?: (type: ObjectType) => Array<{ id: string; label: string }>;
  /**
   * Write a new relationship to the DB.
   * Defaults to the real createRelationship() from typed-schema.
   */
  writeRelationship?: (params: {
    fromId: string;
    toId: string;
    relType: string;
    weight: number;
  }) => void;
  /**
   * Optional LLM inference function. When absent, the infer phase is skipped.
   * Provided separately from the DB deps to keep the LLM concern isolated.
   */
  inferFn?: InferFn;
};

export type CompactorOptions = {
  /** How often to run compaction, in ms. Default: 60_000 (1 minute). */
  intervalMs?: number;
  /** Minimum time between LLM infer calls, in ms. Default: 300_000 (5 minutes). */
  inferDebounceMs?: number;
  /** Max Interaction objects to feed into each LLM infer call. Default: 20. */
  inferBatchSize?: number;
  deps?: CompactorDeps;
};

export type CompactorHandle = {
  /** Stop the compactor and cancel the next scheduled run. */
  stop: () => void;
  /** Run one compaction cycle immediately (useful for tests and manual triggers). */
  runOnce: () => Promise<void>;
};

// ── Logger ─────────────────────────────────────────────────────────────────────

const log = createSubsystemLogger("memory/compactor");

// ── Phase implementations ──────────────────────────────────────────────────────

async function runPrunePhase(pruneFn: () => number): Promise<void> {
  try {
    const count = pruneFn();
    if (count > 0) {
      log.info(`[compactor] pruned ${count} expired memory object(s)`);
    }
  } catch (err) {
    log.warn(`[compactor] prune phase failed: ${String(err)}`);
  }
}

async function runInferPhase(
  listByType: (type: ObjectType) => Array<{ id: string; label: string }>,
  writeRelationship: (params: {
    fromId: string;
    toId: string;
    relType: string;
    weight: number;
  }) => void,
  inferFn: InferFn,
  batchSize: number,
): Promise<void> {
  try {
    const interactions = listByType("interaction").slice(0, batchSize);
    if (interactions.length === 0) {
      return;
    }
    const proposals = await inferFn(interactions);
    let written = 0;
    for (const p of proposals) {
      try {
        writeRelationship({
          fromId: p.fromId,
          toId: p.toId,
          relType: p.relType,
          weight: p.weight ?? 1.0,
        });
        written++;
      } catch (err) {
        log.warn(`[compactor] failed to write inferred relationship: ${String(err)}`);
      }
    }
    if (written > 0) {
      log.info(
        `[compactor] inferred ${written} new relationship(s) from ${interactions.length} interactions`,
      );
    }
  } catch (err) {
    log.warn(`[compactor] infer phase failed: ${String(err)}`);
  }
}

async function runDedupePhase(
  listByType: (type: ObjectType) => Array<{ id: string; label: string }>,
  writeRelationship: (params: {
    fromId: string;
    toId: string;
    relType: string;
    weight: number;
  }) => void,
): Promise<void> {
  try {
    const entities = listByType("entity");
    if (entities.length < 2) {
      return;
    }

    // Simple label-based near-duplicate detection (case-insensitive exact match after normalisation)
    const seen = new Map<string, string>(); // normalised label → first id
    let dupes = 0;
    for (const e of entities) {
      const key = e.label.trim().toLowerCase();
      const existing = seen.get(key);
      if (existing) {
        // Create a 'related_to' edge between the duplicate and the canonical one
        try {
          writeRelationship({ fromId: e.id, toId: existing, relType: "related_to", weight: 0.9 });
          dupes++;
        } catch {
          // ignore if relationship already exists
        }
      } else {
        seen.set(key, e.id);
      }
    }
    if (dupes > 0) {
      log.info(`[compactor] linked ${dupes} near-duplicate entity pair(s)`);
    }
  } catch (err) {
    log.warn(`[compactor] dedupe phase failed: ${String(err)}`);
  }
}

// ── Real DB dep loader (lazy to avoid import-time side effects) ───────────────

async function loadRealDeps(): Promise<Required<Omit<CompactorDeps, "inferFn">>> {
  const schema = await import("../typed-schema.js");
  return {
    prune: schema.pruneExpiredObjects,
    listByType: schema.listObjectsByType,
    writeRelationship: schema.createRelationship,
  };
}

// ── Main API ───────────────────────────────────────────────────────────────────

/**
 * Start the compactor background loop.
 *
 * Call `stop()` on the returned handle to cancel.
 * Errors in any phase are caught and logged — they never propagate.
 *
 * @example
 * const compactor = startCompactor({ deps: { inferFn: myLlmFn } });
 * // ... later ...
 * compactor.stop();
 */
export function startCompactor(options: CompactorOptions = {}): CompactorHandle {
  const intervalMs = options.intervalMs ?? 60_000;
  const inferDebounceMs = options.inferDebounceMs ?? 300_000;
  const inferBatchSize = options.inferBatchSize ?? 20;

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastInferAt = 0;

  async function runOnce(): Promise<void> {
    if (stopped) {
      return;
    }

    // Resolve deps lazily (real DB fns or injected test doubles)
    let prune: () => number;
    let listByType: (type: ObjectType) => Array<{ id: string; label: string }>;
    let writeRelationship: (params: {
      fromId: string;
      toId: string;
      relType: string;
      weight: number;
    }) => void;

    try {
      if (options.deps?.prune && options.deps.listByType && options.deps.writeRelationship) {
        prune = options.deps.prune;
        listByType = options.deps.listByType;
        writeRelationship = options.deps.writeRelationship;
      } else {
        const real = await loadRealDeps();
        prune = options.deps?.prune ?? real.prune;
        listByType = options.deps?.listByType ?? real.listByType;
        writeRelationship = options.deps?.writeRelationship ?? real.writeRelationship;
      }
    } catch (err) {
      log.warn(`[compactor] failed to load DB deps: ${String(err)}`);
      return;
    }

    // Phase 1: prune
    await runPrunePhase(prune);

    // Phase 2: LLM infer (debounced)
    const inferFn = options.deps?.inferFn;
    if (inferFn) {
      const now = Date.now();
      if (now - lastInferAt >= inferDebounceMs) {
        lastInferAt = now;
        await runInferPhase(listByType, writeRelationship, inferFn, inferBatchSize);
      }
    }

    // Phase 3: dedupe
    await runDedupePhase(listByType, writeRelationship);
  }

  // Schedule interval
  timer = setInterval(() => {
    runOnce().catch((err) => {
      log.warn(`[compactor] unexpected error in compaction cycle: ${String(err)}`);
    });
  }, intervalMs);

  // Prevent the timer from blocking process exit
  if (timer.unref) {
    timer.unref();
  }

  return {
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    runOnce,
  };
}
