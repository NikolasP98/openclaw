import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensurePipelineSchema } from "./db.js";
import { claimStep, completeStep, failStep, getRunSteps, getStepOutput } from "./step-queue.js";

describe("step-queue", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    ensurePipelineSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  function insertRun(id: string): void {
    db.prepare(
      `INSERT INTO pipeline_runs (id, workflow, status, created_at) VALUES (?, ?, 'pending', ?)`,
    ).run(id, "test-workflow", Date.now());
  }

  function insertStep(params: {
    id: string;
    runId: string;
    name: string;
    dependsOn?: string;
    input?: string;
  }): void {
    db.prepare(
      `INSERT INTO pipeline_steps (id, run_id, name, status, depends_on, input, attempt)
       VALUES (?, ?, ?, 'pending', ?, ?, 0)`,
    ).run(params.id, params.runId, params.name, params.dependsOn ?? null, params.input ?? null);
  }

  describe("claimStep", () => {
    it("claims the first pending step with no dependencies", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "step-1" });

      const step = claimStep(db, "run-1");
      expect(step).toBeDefined();
      expect(step!.id).toBe("s1");
      expect(step!.status).toBe("running");
      expect(step!.claimed_at).toBeGreaterThan(0);
      expect(step!.attempt).toBe(1);
    });

    it("returns undefined when no pending steps exist", () => {
      insertRun("run-1");
      expect(claimStep(db, "run-1")).toBeUndefined();
    });

    it("skips steps with unmet dependencies", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "build" });
      insertStep({ id: "s2", runId: "run-1", name: "test", dependsOn: "s1" });

      // s2 depends on s1, which is pending — only s1 should be claimable
      const step = claimStep(db, "run-1");
      expect(step!.id).toBe("s1");

      // s2 should still not be claimable (s1 is running, not completed)
      expect(claimStep(db, "run-1")).toBeUndefined();
    });

    it("claims dependent step after dependency completes", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "build" });
      insertStep({ id: "s2", runId: "run-1", name: "test", dependsOn: "s1" });

      const s1 = claimStep(db, "run-1");
      completeStep(db, s1!.id, "build-output");

      const s2 = claimStep(db, "run-1");
      expect(s2).toBeDefined();
      expect(s2!.id).toBe("s2");
      expect(s2!.name).toBe("test");
    });

    it("handles multiple dependencies (comma-separated)", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "compile" });
      insertStep({ id: "s2", runId: "run-1", name: "lint" });
      insertStep({ id: "s3", runId: "run-1", name: "deploy", dependsOn: "s1,s2" });

      // Claim and complete s1
      const s1 = claimStep(db, "run-1");
      completeStep(db, s1!.id, "ok");

      // s3 still blocked on s2
      const s2 = claimStep(db, "run-1");
      expect(s2!.id).toBe("s2");

      // s3 still not available
      expect(claimStep(db, "run-1")).toBeUndefined();

      // Complete s2 → s3 becomes available
      completeStep(db, s2!.id, "ok");
      const s3 = claimStep(db, "run-1");
      expect(s3!.id).toBe("s3");
    });

    it("increments attempt on re-claim after failure", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "flaky" });

      const first = claimStep(db, "run-1");
      expect(first!.attempt).toBe(1);

      // Fail and reset to pending for retry
      failStep(db, "s1", "timeout");
      db.prepare(`UPDATE pipeline_steps SET status = 'pending' WHERE id = ?`).run("s1");

      const second = claimStep(db, "run-1");
      expect(second!.attempt).toBe(2);
    });
  });

  describe("completeStep", () => {
    it("sets status to completed with output", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "build" });

      claimStep(db, "run-1");
      completeStep(db, "s1", '{"artifact":"dist/bundle.js"}');

      const steps = getRunSteps(db, "run-1");
      expect(steps[0].status).toBe("completed");
      expect(steps[0].output).toBe('{"artifact":"dist/bundle.js"}');
      expect(steps[0].completed_at).toBeGreaterThan(0);
    });
  });

  describe("failStep", () => {
    it("sets status to failed with error", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "build" });

      claimStep(db, "run-1");
      failStep(db, "s1", "compilation error");

      const steps = getRunSteps(db, "run-1");
      expect(steps[0].status).toBe("failed");
      expect(steps[0].error).toBe("compilation error");
    });
  });

  describe("getStepOutput", () => {
    it("returns output for completed step", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "build" });

      claimStep(db, "run-1");
      completeStep(db, "s1", "hello world");

      expect(getStepOutput(db, "s1")).toBe("hello world");
    });

    it("returns null for step with no output", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "build" });
      expect(getStepOutput(db, "s1")).toBeNull();
    });

    it("returns null for nonexistent step", () => {
      expect(getStepOutput(db, "nonexistent")).toBeNull();
    });
  });

  describe("getRunSteps", () => {
    it("returns all steps for a run in order", () => {
      insertRun("run-1");
      insertStep({ id: "s1", runId: "run-1", name: "a" });
      insertStep({ id: "s2", runId: "run-1", name: "b" });
      insertStep({ id: "s3", runId: "run-1", name: "c" });

      const steps = getRunSteps(db, "run-1");
      expect(steps).toHaveLength(3);
      expect(steps.map((s) => s.name)).toEqual(["a", "b", "c"]);
    });

    it("returns empty array for unknown run", () => {
      expect(getRunSteps(db, "nonexistent")).toHaveLength(0);
    });
  });
});
