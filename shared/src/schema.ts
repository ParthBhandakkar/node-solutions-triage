import { z } from "zod";
import {
  CategorySchema, ChannelSchema, OwnerSchema, PrioritySchema, RiskSignalSchema,
  StatusSchema
} from "./taxonomy.js";

const EntitySchema = z.object({
  invoice_ids: z.array(z.string()).default([]),
  systems: z.array(z.string()).default([]),
  dates: z.array(z.string()).default([]),
  quantities: z.array(z.string()).default([]),
  people: z.array(z.string()).default([])
});

export const AnalysisSchema = z.object({
  summary: z.string().min(10).max(220),
  category: CategorySchema,
  secondary_category: CategorySchema.nullable(),
  priority: PrioritySchema,
  priority_reason: z.string().min(10).max(240),
  owner: OwnerSchema,
  owner_reason: z.string().min(5).max(240),
  risk_signals: z.array(RiskSignalSchema).max(10),
  entities: EntitySchema,
  client_tone: z.enum(["neutral", "frustrated", "angry", "positive", "urgent"]),
  requested_action: z.string().max(240),
  clarifying_questions: z.array(z.string()).max(4),
  confidence: z.object({
    category: z.number().min(0).max(1),
    priority: z.number().min(0).max(1),
    owner: z.number().min(0).max(1)
  })
});

export const DraftSchema = z.object({
  subject: z.string().min(5).max(120),
  body: z.string().min(30).max(2200),
  internal_note: z.string().max(700),
  next_steps: z.array(z.string()).min(1).max(5)
});

export const AppliedRuleSchema = z.object({
  id: z.string(),
  effect: z.string(),
  because: z.string()
});

export const SlaSchema = z.object({
  acknowledge_by: z.string(),
  resolve_by: z.string(),
  internal_action: z.string()
});

export const HumanEditSchema = z.object({
  at: z.string(),
  field: z.string(),
  from: z.string(),
  to: z.string()
});

export const MetaSchema = z.object({
  provider: z.string(),
  model: z.string(),
  analyze_ms: z.number(),
  compose_ms: z.number(),
  total_ms: z.number(),
  usage: z.object({ input: z.number(), output: z.number() }).nullable(),
  degraded: z.boolean(),
  repaired: z.boolean(),
  prompt_version: z.string()
});

export const TriagedRequestSchema = z.object({
  id: z.string(),
  received_at: z.string(),
  channel: ChannelSchema,
  sender_name: z.string().nullable(),
  raw_text: z.string(),
  analysis: AnalysisSchema,
  final: z.object({
    category: CategorySchema,
    priority: PrioritySchema,
    priority_reason: z.string(),
    owner: OwnerSchema,
    also_notify: z.array(OwnerSchema),
    tags: z.array(z.string())
  }),
  applied_rules: z.array(AppliedRuleSchema),
  sla: SlaSchema,
  draft: DraftSchema,
  status: StatusSchema,
  needs_human_review: z.boolean(),
  review_reasons: z.array(z.string()),
  human_edits: z.array(HumanEditSchema),
  meta: MetaSchema
});

export const TriageInputSchema = z.object({
  text: z.string().trim().min(5).max(8000),
  channel: ChannelSchema.optional().default("email"),
  sender_name: z.string().trim().max(120).optional().nullable()
});

export const BatchInputSchema = z.object({
  items: z.array(TriageInputSchema.extend({ label: z.string().optional() })).min(1).max(20)
});

export const PatchRequestSchema = z.object({
  category: CategorySchema.optional(),
  priority: PrioritySchema.optional(),
  owner: OwnerSchema.optional(),
  status: StatusSchema.optional(),
  draft: DraftSchema.partial().optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type Analysis = z.infer<typeof AnalysisSchema>;
export type Draft = z.infer<typeof DraftSchema>;
export type AppliedRule = z.infer<typeof AppliedRuleSchema>;
export type Sla = z.infer<typeof SlaSchema>;
export type TriagedRequest = z.infer<typeof TriagedRequestSchema>;
export type TriageInput = z.infer<typeof TriageInputSchema>;
export type BatchInput = z.infer<typeof BatchInputSchema>;
export type PatchRequest = z.infer<typeof PatchRequestSchema>;
