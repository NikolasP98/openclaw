import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensurePipelineSchema } from "./db.js";
import { getRunSteps } from "./step-queue.js";
import {
  createRunFromWorkflow,
  executeRun,
  parseWorkflow,
  type StepExecutor,
} from "./workflow-runner.js";

describe("parseWorkflow", () => {
  it("parses a valid YAML workflow", () => {
    const yaml = `
name: test-pipeline
description: A test workflow
steps:
  build:
    action: shell
    input:
      command: npm run build
  test:
    action: shell
    depends_on: [build]
    input:
      command: npm test
`;
    const workflow = parseWorkflow(yaml);
    expect(workflow.name).toBe("test-pipeline");
    expect(Object.keys(workflow.steps)).toEqual(["build", "test"]);
    expect(workflow.steps.test.depends_on).toEqual(["build"]);
  });

  it("rejects workflow with no steps", () => {
    const yaml = `
name: empty
steps: {}
`;
    expect(() => parseWorkflow(yaml)).toThrow("at least one step");
  });

  it("rejects workflow with missing name", () => {
    const yaml = `
steps:
  build:
    action: shell
`;
    expect(() => parseWorkflow(yaml)).toThrow();
  });

  it("rejects step with missing action", () => {
    const yaml = `
name: bad
steps:
  build:
    input:
      command: echo hi
`;
    expect(() => parseWorkflow(yaml)).toThrow();
  });

  it("rejects unknown step fields in strict mode", () => {
    const yaml = `
name: bad
steps:
  build:
    action: shell
    unknownField: true
`;
    expect(() => parseWorkflow(yaml)).toThrow();
  });
});

describe("createRunFromWorkflow + executeRun", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    ensurePipelineSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  const simpleWorkflow = parseWorkflow(`
name: simple
steps:
  greet:
    action: echo
    input:
      message: hello
`);

  const chainWorkflow = parseWorkflow(`
name: chain
steps:
  step1:
    action: produce
    input:
      value: first
  step2:
    action: consume
    depends_on: [step1]
`);

  const echoExecutor: StepExecutor = async ({ action, input }) => {
    if (action === "echo") {
      return JSON.stringify(input.message ?? "");
    }
    if (action === "produce") {
      return JSON.stringify(input.value ?? "");
    }
    if (action === "consume") {
      return "consumed";
    }
    return "ok";
  };

  it("creates a run with correct steps", () => {
    const runId = createRunFromWorkflow(db, simpleWorkflow);
    const steps = getRunSteps(db, runId);
    expect(steps).toHaveLength(1);
    expect(steps[0].name).toBe("greet");
    expect(steps[0].status).toBe("pending");
  });

  it("executes a simple single-step workflow", async () => {
    const runId = createRunFromWorkflow(db, simpleWorkflow);
    const result = await executeRun(db, runId, simpleWorkflow, echoExecutor);

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[0].output).toBe('"hello"');
  });

  it("executes a chained workflow in dependency order", async () => {
    const runId = createRunFromWorkflow(db, chainWorkflow);
    const result = await executeRun(db, runId, chainWorkflow, echoExecutor);

    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[1].status).toBe("completed");
  });

  it("stops execution on step failure", async () => {
    const failingExecutor: StepExecutor = async ({ stepName }) => {
      if (stepName === "step1") {
        throw new Error("step1 exploded");
      }
      return "ok";
    };

    const runId = createRunFromWorkflow(db, chainWorkflow);
    const result = await executeRun(db, runId, chainWorkflow, failingExecutor);

    expect(result.status).toBe("failed");
    expect(result.error).toContain("step1");
    const failedStep = result.steps.find((s) => s.name === "step1");
    expect(failedStep!.status).toBe("failed");
    expect(failedStep!.error).toBe("step1 exploded");
  });

  it("marks pipeline run status in database", async () => {
    const runId = createRunFromWorkflow(db, simpleWorkflow);
    await executeRun(db, runId, simpleWorkflow, echoExecutor);

    const run = db.prepare(`SELECT * FROM pipeline_runs WHERE id = ?`).get(runId) as {
      status: string;
      started_at: number;
      completed_at: number;
    };
    expect(run.status).toBe("completed");
    expect(run.started_at).toBeGreaterThan(0);
    expect(run.completed_at).toBeGreaterThanOrEqual(run.started_at);
  });
});
