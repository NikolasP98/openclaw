import { z } from "zod";

const ExecApprovalForwardTargetSchema = z
  .object({
    channel: z.string().min(1),
    to: z.string().min(1),
    accountId: z.string().optional(),
    threadId: z.union([z.string(), z.number()]).optional(),
  })
  .strict();

const ExecApprovalForwardingSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.union([z.literal("session"), z.literal("targets"), z.literal("both")]).optional(),
    agentFilter: z.array(z.string()).optional(),
    sessionFilter: z.array(z.string()).optional(),
    targets: z.array(ExecApprovalForwardTargetSchema).optional(),
  })
  .strict()
  .optional();

const ApprovalGateModeSchema = z
  .union([z.literal("auto"), z.literal("confirm"), z.literal("admin-only")])
  .optional();

const ApprovalGateCategorySchema = z
  .object({
    shell: ApprovalGateModeSchema,
    file_write: ApprovalGateModeSchema,
    network: ApprovalGateModeSchema,
    database: ApprovalGateModeSchema,
    timeoutMs: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

export const ApprovalsSchema = z
  .object({
    exec: ExecApprovalForwardingSchema,
    gate: ApprovalGateCategorySchema,
  })
  .strict()
  .optional();
