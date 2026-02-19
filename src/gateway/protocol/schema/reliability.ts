import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const ReliabilityCategorySchema = Type.Union([
  Type.Literal("cron"),
  Type.Literal("browser"),
  Type.Literal("timezone"),
  Type.Literal("general"),
  Type.Literal("auth"),
  Type.Literal("skill"),
  Type.Literal("agent"),
  Type.Literal("gateway"),
]);

export const ReliabilitySeveritySchema = Type.Union([
  Type.Literal("critical"),
  Type.Literal("high"),
  Type.Literal("medium"),
  Type.Literal("low"),
]);

export const ReliabilityEventSchema = Type.Object(
  {
    category: ReliabilityCategorySchema,
    severity: ReliabilitySeveritySchema,
    event: NonEmptyString,
    message: Type.String(),
    agentId: Type.Optional(Type.String()),
    sessionKey: Type.Optional(Type.String()),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    timestamp: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const ReliabilityEventsQuerySchema = Type.Object(
  {
    category: Type.Optional(ReliabilityCategorySchema),
    since: Type.Optional(Type.Integer({ minimum: 0 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
  },
  { additionalProperties: false },
);

export const ReliabilitySummaryResultSchema = Type.Object(
  {
    uptimeSinceMs: Type.Integer({ minimum: 0 }),
    total: Type.Integer({ minimum: 0 }),
    byCategory: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
    bySeverity: Type.Record(Type.String(), Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

/** TypeScript types for use outside of schema validation */
export type ReliabilityCategory =
  | "cron"
  | "browser"
  | "timezone"
  | "general"
  | "auth"
  | "skill"
  | "agent"
  | "gateway";
export type ReliabilitySeverity = "critical" | "high" | "medium" | "low";

export type ReliabilityEvent = {
  category: ReliabilityCategory;
  severity: ReliabilitySeverity;
  event: string;
  message: string;
  agentId?: string;
  sessionKey?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
};

export type ReliabilityEventInput = Omit<ReliabilityEvent, "timestamp">;
