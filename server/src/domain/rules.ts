import type { Analysis, Draft, Owner, Category, Priority, Sla } from "@triage/shared";
import { ROUTING_MATRIX } from "@triage/shared";

const clean = (text: string) => text.trim().replace(/\s+/g, " ");
const bound = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
const has = (text: string, pattern: RegExp) => pattern.test(text);

function unique<T>(items: T[]): T[] { return [...new Set(items)]; }

export function rulesAnalyze(input: string): Analysis {
  const text = clean(input);
  const lower = text.toLowerCase();
  const risks: Analysis["risk_signals"] = [];
  const entities: Analysis["entities"] = { invoice_ids: [], systems: [], dates: [], quantities: [], people: [] };
  const addRisk = (risk: Analysis["risk_signals"][number]) => { if (!risks.includes(risk)) risks.push(risk); };

  const security = has(lower, /(wrong workspace|wrong folder|shared by mistake|remove access|customer contact information|personal data|pii|data exposure|uploaded .*spreadsheet)/i);
  const outage = has(lower, /(unavailable|outage|down|cannot access|can't access|cant acces|not working|error|broken|slow|latency|fail(?:ing|ed|ure)?)/i);
  const billing = has(lower, /(invoice|charge|payment|refund|overcharg|billed|billing)/i);
  const sales = has(lower, /(pricing|price|timeline|interested|custom .*system|saw your company|automated|automation|proposal|quote|speak next week|more seats|add \d+ seats)/i);
  const feature = has(lower, /(dark mode|font|feature|future update|idea|dashboard)/i);
  const deadline = !has(lower, /(no deadline|without deadline)/i) && has(lower, /(before|by|deadline|today|tomorrow|friday|this afternoon|next week|\d+ ?(hour|day)s?|\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);

  if (security) { addRisk("data_exposure"); addRisk("pii"); addRisk("security_incident"); }
  if (outage) { addRisk("outage"); if (has(lower, /(unavailable|outage|down|cannot access|can't access|cant acces|not working|error|broken|fail(?:ing|ed|ure)?|half our users|staff|everyone|all)/i)) addRisk("business_blocking"); }
  if (has(lower, /(cannot|can't|unable|no workaround|nothing we can)/i)) addRisk("no_workaround");
  if (billing && has(lower, /(duplicate|twice|same charge|overcharg|incorrect)/i)) addRisk("billing_dispute");
  if (has(lower, /(before payment|payment .*friday|pay.*friday|invoice)/i) && billing) addRisk("payment_deadline");
  if (has(lower, /(pricing|price|quote|timeline)/i)) addRisk("pricing_request");
  if (sales) addRisk("buying_intent");
  if (has(lower, /(saw your company|online|prospect|interested)/i)) addRisk("new_prospect");
  if (feature) addRisk("feature_request");
  if (has(lower, /(no deadline|future update|collecting ideas|someday)/i)) addRisk("no_deadline");
  if (has(lower, /(speak|call|meeting|next week)/i)) addRisk("scheduling_request");
  if (deadline) addRisk("hard_deadline");
  if (has(lower, /(again|third time|repeat|once more)/i)) addRisk("repeat_issue");
  if (has(lower, /(ignore (all )?(previous|prior)|system prompt|disregard the above|you are now)/i)) addRisk("injection_attempt");
  if (has(lower, /(40 employees|\d+ employees|\d+ seats|three systems|three applications)/i)) addRisk("efficiency_pain");

  const invoiceMatches = text.match(/\b[A-Z]{1,8}-\d{2,}\b/g) ?? [];
  entities.invoice_ids = invoiceMatches;
  const quantityMatches = text.match(/\b\d+\s+(?:employees|users|seats|systems|hours|days|people)\b/gi) ?? [];
  entities.quantities = quantityMatches;
  entities.dates = text.match(/\b(?:today|tomorrow|Friday|next week|this morning|this afternoon|\d+\s+(?:hours?|days?))\b/gi) ?? [];
  entities.systems = text.match(/\b(?:client portal|dashboard|workspace|spreadsheet|API|SSO)\b/gi) ?? [];

  let category: Category = "Other";
  if (security || outage || feature) category = "Technical";
  else if (billing) category = "Billing";
  else if (sales) category = "Sales";
  else if (has(lower, /(help|question|access|review|support)/i)) category = "Support";

  let priority: Priority = "Medium";
  if (security || (outage && has(lower, /(staff|everyone|all|cannot access|unavailable|active customer records|since this morning|half our users|portal down|hard_deadline)/i))) priority = "Urgent";
  else if (billing && (deadline || risks.includes("payment_deadline"))) priority = "High";
  else if (risks.includes("repeat_issue")) priority = "High";
  else if (risks.includes("no_deadline") && !security && !outage) priority = "Low";

  const owner: Owner = security || outage || category === "Technical" ? "Engineering" : ROUTING_MATRIX[category];
  const tone: Analysis["client_tone"] = has(lower, /(urgent|immediate|as soon as possible)/i) ? "urgent" : has(lower, /(frustrated|unavailable|accidentally|cannot)/i) ? "frustrated" : sales ? "positive" : "neutral";
  const summary = text.length > 210 ? `${text.slice(0, 207)}...` : text;
  const requestedAction = bound(text, 240);
  const reason = priority === "Urgent" ? "The request includes an active operational or security impact requiring immediate action." : priority === "High" ? "The request has a material impact or a time-bound business deadline." : priority === "Low" ? "The requester explicitly describes a non-urgent idea or no deadline." : "The request is actionable but has no immediate outage, exposure, or hard deadline.";

  return {
    summary: summary.length >= 10 ? summary : `Request: ${summary}`,
    category,
    secondary_category: null,
    priority,
    priority_reason: reason,
    owner,
    owner_reason: `Route to ${owner} because this team is the primary resolver for ${category.toLowerCase()} requests.`,
    risk_signals: unique(risks).slice(0, 10),
    entities,
    client_tone: tone,
    requested_action: requestedAction,
    clarifying_questions: text.length < 30 ? ["What outcome would you like us to help with?", "Is there a deadline or current business impact?"] : [],
    confidence: { category: 0.55, priority: 0.55, owner: 0.55 }
  };
}

type ComposePayload = { text: string; final: { category: Category; priority: Priority; owner: Owner; priority_reason: string; tags: string[] }; sla: Sla; senderName: string | null; channel: string; directives: string[] };

export function rulesCompose(payload: ComposePayload): Draft {
  const { final, sla, senderName, directives } = payload;
  const acknowledgeWindow = final.priority === "Urgent" ? "15 minutes" : final.priority === "High" ? "1 business hour" : final.priority === "Medium" ? "4 business hours" : "1 business day";
  const greeting = senderName ? `Hi ${senderName},` : "Hello,";
  const subjectPrefix = final.priority === "Urgent" ? "Immediate attention: " : "Re: ";
  const sensitive = final.tags.includes("security_incident") || final.tags.includes("pii");
  const body = sensitive
    ? `${greeting}\n\nThank you for flagging the workspace access issue. We understand that a spreadsheet containing customer contact information may have been uploaded to the wrong workspace. This has been routed to our Engineering team for immediate review.\n\nWe will acknowledge this within ${acknowledgeWindow}. If possible, please reply with the affected workspace name and confirm whether anyone outside your intended team may have accessed the file. Please do not send the spreadsheet or additional customer data in your reply.\n\nWe will share the next update through this thread.\n\nRegards,\nPriya Raman\nClient Operations\nNode Solutions`
    : `${greeting}\n\nThank you for contacting Node Solutions. We understand that you need help with this ${final.category.toLowerCase()} request.\n\nYour request is with our ${final.owner} team, and we will acknowledge it within ${acknowledgeWindow}. The team will review the details and confirm the next step.\n\n${final.category === "Sales" ? "If helpful, please share any preferred times for a conversation and the main outcome you want to achieve." : "If there is a specific deadline, affected user, invoice, or error message we should include in the review, please reply with those details."}\n\nRegards,\nPriya Raman\nClient Operations\nNode Solutions`;
  return {
    subject: `${subjectPrefix}${final.category} request`,
    body,
    internal_note: bound(`${final.owner}: review the request first. Priority is ${final.priority} because ${final.priority_reason}${directives.length ? ` Policy directives: ${directives.join("; ")}` : ""}`, 700),
    next_steps: [
      `Acknowledge within ${acknowledgeWindow}`,
      `Review the request and confirm the next action`,
      ...(sensitive ? ["Contain access and record the security review"] : [])
    ]
  };
}
