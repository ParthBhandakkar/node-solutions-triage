import { AnalysisSchema, DraftSchema, TriagedRequestSchema, type Analysis, type Channel, type Draft, type TriageInput, type TriagedRequest } from "@triage/shared";
import { applyPolicy } from "../domain/policy.js";
import { calculateSla, getAcknowledgementWindow, getOrgConfig } from "../domain/sla.js";
import { ANALYZE_SYSTEM, COMPOSE_SYSTEM, PROMPT_VERSION } from "../prompts.js";
import type { LlmProvider, ProviderResult, ProviderUsage } from "../providers/types.js";
import { RulesProvider } from "../providers/rules.js";
import { sanitizeRequest } from "./sanitize.js";

function requestId(): string { return `REQ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; }

function draftHasUnsafeClaims(draft: Draft): boolean {
  const text = `${draft.subject}\n${draft.body}\n${draft.internal_note}`;
  return /\b(?:incident|ticket|case)\s*(?:id|number|#)\s*[:#-]?\s*[A-Z0-9-]{2,}/i.test(text)
    || /[$€£]\s?\d/.test(text)
    || /\b(?:we have|we've|has been|have been|was|were)\s+(?:removed|deleted|fixed|resolved|contained|completed|initiated|created|opened|logged|notified|escalated)\b/i.test(text);
}

export async function triageRequest(input: TriageInput, provider: LlmProvider): Promise<TriagedRequest> {
  const started = Date.now();
  const sanitized = sanitizeRequest(input.text);
  const fallback = new RulesProvider();
  let activeProvider = provider;
  const fallbackReasons: string[] = [];
  const analyzeInput = { system: ANALYZE_SYSTEM, user: JSON.stringify({ stage: "analyze", text: `<request>${sanitized.text}</request>`, channel: input.channel ?? "email" }), schema: AnalysisSchema, temperature: 0.1, maxOutputTokens: 1200 };
  let analysisResult: ProviderResult<Analysis>;
  try {
    analysisResult = await provider.generateJson<Analysis>(analyzeInput);
  } catch {
    activeProvider = fallback;
    fallbackReasons.push("The configured analyzer returned invalid or unavailable structured output; deterministic analysis was used.");
    analysisResult = await fallback.generateJson<Analysis>(analyzeInput);
  }
  const policy = applyPolicy(analysisResult.data, sanitized.text);
  const received = new Date();
  const sla = calculateSla(policy.priority, received);
  const composeInput = { system: COMPOSE_SYSTEM, user: JSON.stringify({ stage: "compose", text: sanitized.text, final: { category: policy.category, priority: policy.priority, owner: policy.owner, priority_reason: policy.priority_reason, tags: policy.tags }, sla, acknowledge_window: getAcknowledgementWindow(policy.priority), senderName: input.sender_name ?? null, channel: input.channel ?? "email", directives: policy.compose_directives }), schema: DraftSchema, temperature: 0.35, maxOutputTokens: input.channel === "chat" ? 500 : 900 };
  let composeResult: ProviderResult<Draft>;
  try {
    composeResult = await activeProvider.generateJson<Draft>(composeInput);
  } catch {
    activeProvider = fallback;
    fallbackReasons.push("The configured composer returned invalid or unavailable structured output; deterministic drafting was used.");
    composeResult = await fallback.generateJson<Draft>(composeInput);
  }
  if (draftHasUnsafeClaims(composeResult.data)) {
    activeProvider = fallback;
    fallbackReasons.push("The generated draft contained an invented identifier, amount, or completed-action claim; deterministic drafting was used.");
    composeResult = await fallback.generateJson<Draft>(composeInput);
  }
  const degraded = !activeProvider.isLlm || fallbackReasons.length > 0;
  const usage: ProviderUsage | null = analysisResult.usage && composeResult.usage ? { input: analysisResult.usage.input + composeResult.usage.input, output: analysisResult.usage.output + composeResult.usage.output } : null;
  const result: TriagedRequest = {
    id: requestId(),
    received_at: received.toISOString(),
    channel: (input.channel ?? "email") as Channel,
    sender_name: input.sender_name ?? null,
    raw_text: input.text,
    analysis: analysisResult.data,
    final: { category: policy.category, priority: policy.priority, priority_reason: policy.priority_reason, owner: policy.owner, also_notify: policy.also_notify, tags: policy.tags },
    applied_rules: policy.applied_rules,
    sla,
    draft: composeResult.data,
    status: policy.needs_human_review || degraded ? "needs_review" : "triaged",
    needs_human_review: policy.needs_human_review || degraded,
    review_reasons: [...policy.review_reasons, ...fallbackReasons, ...(degraded && !fallbackReasons.length ? ["Generated in deterministic fallback mode; an operator should review before sending."] : [])],
    human_edits: [],
    meta: { provider: activeProvider.name, model: activeProvider.model, analyze_ms: analysisResult.latencyMs, compose_ms: composeResult.latencyMs, total_ms: Date.now() - started, usage, degraded, repaired: analysisResult.repaired || composeResult.repaired, prompt_version: PROMPT_VERSION }
  };
  return TriagedRequestSchema.parse(result);
}

export function getPipelineProviderLabel(provider: LlmProvider): string { return `${provider.name} · ${provider.model}`; }
export function getConfigForClient(provider: LlmProvider) { return { org: getOrgConfig(), provider: { name: provider.name, model: provider.model, isLlm: provider.isLlm } }; }
