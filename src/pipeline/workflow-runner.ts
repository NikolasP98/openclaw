/**
 * Workflow runner — parse YAML, create pipeline run/steps, execute.
 *
 * Orchestrates a workflow by:
 * 1. Parsing and validating the YAML definition
 * 2. Creating a pipeline run + steps in the SQLite database
 * 3. Resolving dependencies and executing steps in topological order
 *
 * @module
 */

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { parse as parseYaml } from "yaml";
import { claimStep, completeStep, failStep, getRunSteps, type StepRow } from "./step-queue.js";
import { WorkflowSchema, type WorkflowDefinition } from "./workflow-schema.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type StepExecutor = (params: {
  stepName: string;
  action: string;
  input: Record<string, unknown>;
  /** Outputs from completed dependency steps (keyed by step name). */
  dependencyOutputs: Record<string, string>;
}) => Promise<string>;

export type WorkflowRunResult = {
  runId: string;
  status: "completed" | "failed";
  steps: StepRow[];
  error?: string;
};

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse and validate a YAML workflow string.
 */
export function parseWorkflow(yamlStr: string): WorkflowDefinition {
  const raw = parseYaml(yamlStr);
  return WorkflowSchema.parse(raw);
}

// ── Run Creation ─────────────────────────────────────────────────────────────

/**
 * Create a pipeline run and its steps from a workflow definition.
 *
 * Returns the run ID. Steps are inserted in declaration order with
 * dependency references resolved to step IDs.
 */
export function createRunFromWorkflow(db: DatabaseSync, workflow: WorkflowDefinition): string {
  const runId = randomUUID();
  const now = Date.now();

  db.prepare(
    `INSERT INTO pipeline_runs (id, workflow, status, created_at) VALUES (?, ?, 'pending', ?)`,
  ).run(runId, workflow.name, now);

  // Map step names → step IDs for dependency resolution.
  const stepNameToId = new Map<string, string>();
  const stepEntries = Object.entries(workflow.steps);

  for (const [name] of stepEntries) {
    stepNameToId.set(name, randomUUID());
  }

  for (const [name, step] of stepEntries) {
    const stepId = stepNameToId.get(name)!;
    const dependsOn =
      step.depends_on
        ?.map((depName) => stepNameToId.get(depName))
        .filter(Boolean)
        .join(",") || null;
    const input = step.input ? JSON.stringify(step.input) : null;

    db.prepare(
      `INSERT INTO pipeline_steps (id, run_id, name, status, depends_on, input, attempt)
       VALUES (?, ?, ?, 'pending', ?, ?, 0)`,
    ).run(stepId, runId, name, dependsOn, input);
  }

  return runId;
}

// ── Execution ────────────────────────────────────────────────────────────────

/**
 * Execute a pipeline run by claiming and running steps until all are done.
 *
 * Steps are executed sequentially in dependency order. The executor function
 * is called for each step with its action, input, and dependency outputs.
 */
export async function executeRun(
  db: DatabaseSync,
  runId: string,
  workflow: WorkflowDefinition,
  executor: StepExecutor,
): Promise<WorkflowRunResult> {
  db.prepare(`UPDATE pipeline_runs SET status = 'running', started_at = ? WHERE id = ?`).run(
    Date.now(),
    runId,
  );

  // Build step name → action mapping for the executor.
  const stepNameToAction = new Map<string, { action: string; input: Record<string, unknown> }>();
  for (const [name, step] of Object.entries(workflow.steps)) {
    stepNameToAction.set(name, {
      action: step.action,
      input: step.input ?? {},
    });
  }

  let failedStep: StepRow | undefined;

  // Keep claiming and executing until no more steps are available.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const step = claimStep(db, runId);
    if (!step) {
      // No more claimable steps — check if all are completed or some failed.
      break;
    }

    const stepDef = stepNameToAction.get(step.name);
    if (!stepDef) {
      failStep(db, step.id, `Unknown step: ${step.name}`);
      failedStep = step;
      break;
    }

    // Gather dependency outputs.
    const allSteps = getRunSteps(db, runId);
    const dependencyOutputs: Record<string, string> = {};
    if (step.depends_on) {
      const depIds = new Set(step.depends_on.split(",").map((s) => s.trim()));
      for (const depStep of allSteps) {
        if (depIds.has(depStep.id) && depStep.output) {
          dependencyOutputs[depStep.name] = depStep.output;
        }
      }
    }

    try {
      const output = await executor({
        stepName: step.name,
        action: stepDef.action,
        input: stepDef.input,
        dependencyOutputs,
      });
      completeStep(db, step.id, output);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      failStep(db, step.id, errorMsg);
      failedStep = step;
      break;
    }
  }

  const finalSteps = getRunSteps(db, runId);
  const allCompleted = finalSteps.every((s) => s.status === "completed");
  const status = allCompleted ? "completed" : "failed";

  db.prepare(`UPDATE pipeline_runs SET status = ?, completed_at = ? WHERE id = ?`).run(
    status,
    Date.now(),
    runId,
  );

  return {
    runId,
    status,
    steps: finalSteps,
    error: failedStep ? `Step "${failedStep.name}" failed` : undefined,
  };
}
