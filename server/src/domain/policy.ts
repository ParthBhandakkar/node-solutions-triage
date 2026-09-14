import type { Analysis, AppliedRule, Category, Owner, Priority } from "@triage/shared";
import { maxPriority, minPriority, PRIORITY_RANK, ROUTING_MATRIX } from "@triage/shared";

export type PolicyDecision = {
  category: Category;
  priority: Priority;
  priority_reason: string;
  owner: Owner;
  also_notify: Owner[];
  tags: string[];
  applied_rules: AppliedRule[];
  needs_human_review: boolean;
  review_reasons: string[];
  compose_directives: string[];
};

const has = (text: string, pattern: RegExp) => pattern.test(text.toLowerCase());
const includesAny = (values: string[], wanted: string[]) => wanted.some((value) => values.includes(value));

export function applyPolicy(analysis: Analysis, rawText: string): PolicyDecision {
  const lower = rawText.toLowerCase();
  let category = analysis.category;
  let priority = analysis.priority;
  let priorityReason = analysis.priority_reason;
  let owner = analysis.owner || ROUTING_MATRIX[category];
  const alsoNotify: Owner[] = [];
  const tags: string[] = [];
  const appliedRules: AppliedRule[] = [];
  const reviewReasons: string[] = [];
  const directives: string[] = [];
  let needsReview = false;
  let minimumPriority: Priority = "Low";
  let maximumPriority: Priority = "Urgent";

  const addRule = (id: string, effect: string, because: string) => appliedRules.push({ id, effect, because });
  const addTag = (tag: string) => { if (!tags.includes(tag)) tags.push(tag); };
  const notify = (notifyOwner: Owner) => { if (!alsoNotify.includes(notifyOwner) && notifyOwner !== owner) alsoNotify.push(notifyOwner); };

  const securitySignal = includesAny(analysis.risk_signals, ["data_exposure", "pii", "security_incident"]);
  const securityText = has(rawText, /(wrong workspace|wrong folder|shared by mistake|remove access|customer contact information|personal data|pii|data exposure|uploaded .*spreadsheet)/i);
  if (securitySignal || securityText) {
    category = "Technical";
    minimumPriority = maxPriority(minimumPriority, "Urgent");
    priority = maxPriority(priority, "Urgent");
    owner = "Engineering";
    notify("Client Success");
    needsReview = true;
    reviewReasons.push("Potential data exposure requires human review before any response is sent.");
    addTag("security_incident"); addTag("pii"); addTag("containment");
    directives.push("Treat as a potential data-exposure incident; ask only for containment details, do not request more customer data, and do not admit liability.");
    addRule("DATA_EXPOSURE_01", `${analysis.priority} → Urgent; owner → Engineering`, "matched customer-data and wrong-workspace/access-removal language");
  }

  const outageSignal = analysis.risk_signals.includes("outage") || has(rawText, /(unavailable|outage|down|cannot access|can't access|cant acces|slow|latency|fail(?:ing|ed|ure)?)/i);
  if (outageSignal && (analysis.risk_signals.includes("business_blocking") || has(rawText, /(staff|everyone|all|active customer records|since this morning|half our users|portal down)/i))) {
    category = "Technical";
    priority = maxPriority(priority, "Urgent");
    owner = "Engineering";
    addTag("incident");
    directives.push("Acknowledge the impact and ask for the affected environment or error details without promising a resolution time.");
    addRule("OUTAGE_02", `${analysis.priority} → ${priority}; owner → Engineering`, "matched service unavailability with blocked staff access");
  }

  if ((analysis.risk_signals.includes("billing_dispute") || has(rawText, /(invoice|charge|payment)/i)) && (analysis.risk_signals.includes("payment_deadline") || has(rawText, /(before payment|payment .*friday|by friday)/i))) {
    category = "Billing";
    priority = maxPriority(priority, "High");
    owner = "Finance";
    addTag("pre_payment_review");
    directives.push("Confirm the invoice and payment deadline; do not state that the charge is definitely incorrect before Finance reviews it.");
    addRule("PAYMENT_DEADLINE_03", `${analysis.priority} → ${priority}; owner → Finance`, "matched an invoice or disputed charge with a payment deadline");
  }

  if (has(rawText, /(legal|lawyer|attorney|breach of contract|regulator|gdpr|dpa)/i)) {
    priority = maxPriority(priority, "High");
    notify("Client Success"); addTag("legal_review");
    directives.push("Acknowledge receipt only and avoid legal conclusions or commitments.");
    addRule("LEGAL_04", `${analysis.priority} → ${priority}; notify Client Success`, "matched legal or regulatory language");
  }

  const explicitlyNoDeadline = analysis.risk_signals.includes("no_deadline") || has(rawText, /(no deadline|future update|collecting ideas|someday)/i);
  const hasImpact = securitySignal || outageSignal || analysis.risk_signals.includes("hard_deadline") || has(rawText, /(immediate|urgent|blocked|cannot|unavailable)/i);
  if (explicitlyNoDeadline && !hasImpact) {
    maximumPriority = minPriority(maximumPriority, "Low");
    priority = minPriority(priority, "Low");
    addTag("backlog");
    addRule("EXPLICIT_NO_DEADLINE_05", `${analysis.priority} → Low`, "matched an explicitly future-facing request with no deadline");
  }

  if (analysis.risk_signals.includes("new_prospect") || analysis.risk_signals.includes("pricing_request") || has(rawText, /(pricing|what would .*cost|saw your company online)/i)) {
    category = "Sales";
    owner = "Sales Team";
    addTag("new_business");
    addRule("PRESALES_ROUTE_06", `owner → Sales Team`, "matched prospect, pricing, or commercial-intent language");
  }

  if (analysis.risk_signals.includes("efficiency_pain") && has(rawText, /(employee|user|seat|systems|automated)/i)) {
    notify("Sales Team"); addTag("expansion");
    addRule("SEATS_EXPANSION_07", `notify Sales Team`, "matched a sizable automation or systems-expansion opportunity");
  }

  if (analysis.confidence.category < 0.6 || analysis.confidence.priority < 0.6 || analysis.confidence.owner < 0.6) {
    needsReview = true;
    reviewReasons.push("One or more model confidence scores are below 0.6.");
    addRule("LOW_CONFIDENCE_08", "human review required", "category, priority, or owner confidence is below 0.6");
  }

  if (analysis.risk_signals.includes("vague_request") || rawText.trim().split(/\s+/).length < 3) {
    category = "Other";
    needsReview = true;
    reviewReasons.push("The request is too vague to route confidently.");
    addRule("VAGUE_09", "category → Other; human review required", "request lacks enough actionable context");
  }

  if (analysis.client_tone === "angry" || (analysis.client_tone === "frustrated" && analysis.risk_signals.includes("repeat_issue"))) {
    priority = maxPriority(priority, "High"); addTag("churn_risk");
    directives.push("Acknowledge the frustration without being defensive and name the concrete next action.");
    addRule("TONE_ESCALATION_10", `${analysis.priority} → ${priority}`, "matched frustrated or angry tone with repeat-issue risk");
  }

  const injection = analysis.risk_signals.includes("injection_attempt") || has(rawText, /(ignore (all )?(previous|prior) instructions|system prompt|disregard the above|you are now)/i);
  if (injection) {
    needsReview = true; addTag("suspicious_input");
    reviewReasons.push("The request contains text that attempts to manipulate the triage instructions.");
    if (!securitySignal && !outageSignal) priority = "Medium";
    addRule("INJECTION_11", "model-proposed priority disregarded; human review required", "matched instruction-manipulation language inside request data");
  }

  if (PRIORITY_RANK[priority] < PRIORITY_RANK[minimumPriority]) priority = minimumPriority;
  if (PRIORITY_RANK[priority] > PRIORITY_RANK[maximumPriority]) priority = maximumPriority;
  if (!owner) owner = ROUTING_MATRIX[category];
  const policyReason = appliedRules.length ? `${priorityReason} Policy applied: ${appliedRules.map((rule) => rule.id).join(", ")}.` : priorityReason;

  return { category, priority, priority_reason: policyReason, owner, also_notify: alsoNotify, tags, applied_rules: appliedRules, needs_human_review: needsReview, review_reasons: reviewReasons, compose_directives: directives };
}
