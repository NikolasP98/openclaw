/**
 * YAML workflow definition schema — Zod validation for pipeline workflows.
 *
 * Workflows are defined as YAML files with named steps, each specifying
 * an action, optional dependencies, and input parameters.
 *
 * @module
 */

import { z } from "zod";

// ── Step Schema ──────────────────────────────────────────────────────────────

export const WorkflowStepSchema = z
  .object({
    /** Step action type (e.g. "agent", "shell", "http", "transform"). */
    action: z.string().min(1),
    /** Step dependencies — list of step names that must complete first. */
    depends_on: z.array(z.string()).optional(),
    /** Action-specific input parameters. */
    input: z.record(z.string(), z.unknown()).optional(),
    /** Timeout in seconds for this step (default: 300). */
    timeout: z.number().int().positive().optional(),
    /** Number of retries on failure (default: 0). */
    retries: z.number().int().min(0).max(5).optional(),
  })
  .strict();

// ── Workflow Schema ──────────────────────────────────────────────────────────

export const WorkflowSchema = z
  .object({
    /** Workflow name (human-readable identifier). */
    name: z.string().min(1),
    /** Optional description. */
    description: z.string().optional(),
    /** Workflow version (semver or numeric). */
    version: z.string().optional(),
    /** Named steps — keys are step names, values are step definitions. */
    steps: z
      .record(z.string(), WorkflowStepSchema)
      .refine((steps) => Object.keys(steps).length > 0, {
        message: "Workflow must have at least one step",
      }),
  })
  .strict();

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowSchema>;
