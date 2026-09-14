import { z } from "zod";

export const CATEGORIES = ["Sales", "Support", "Billing", "Technical", "Other"] as const;
export const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export const OWNERS = ["Sales Team", "Client Success", "Finance", "Engineering"] as const;
export const STATUSES = ["new", "triaged", "needs_review", "approved", "sent"] as const;
export const CHANNELS = ["email", "web_form", "chat"] as const;
export const RISK_SIGNALS = [
  "outage", "business_blocking", "no_workaround", "data_exposure", "pii",
  "security_incident", "legal_risk", "hard_deadline", "payment_deadline",
  "billing_dispute", "buying_intent", "pricing_request", "new_prospect",
  "feature_request", "no_deadline", "churn_risk", "repeat_issue",
  "scheduling_request", "vague_request", "injection_attempt", "efficiency_pain"
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export const PrioritySchema = z.enum(PRIORITIES);
export const OwnerSchema = z.enum(OWNERS);
export const StatusSchema = z.enum(STATUSES);
export const ChannelSchema = z.enum(CHANNELS);
export const RiskSignalSchema = z.enum(RISK_SIGNALS);

export type Category = typeof CATEGORIES[number];
export type Priority = typeof PRIORITIES[number];
export type Owner = typeof OWNERS[number];
export type Status = typeof STATUSES[number];
export type Channel = typeof CHANNELS[number];
export type RiskSignal = typeof RISK_SIGNALS[number];

export const ROUTING_MATRIX: Record<Category, Owner> = {
  Sales: "Sales Team",
  Support: "Client Success",
  Billing: "Finance",
  Technical: "Engineering",
  Other: "Client Success"
};

export const PRIORITY_RANK: Record<Priority, number> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Urgent: 4
};

export const PRIORITY_ORDER: Priority[] = ["Urgent", "High", "Medium", "Low"];

export function maxPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

export function minPriority(a: Priority, b: Priority): Priority {
  return PRIORITY_RANK[a] <= PRIORITY_RANK[b] ? a : b;
}
