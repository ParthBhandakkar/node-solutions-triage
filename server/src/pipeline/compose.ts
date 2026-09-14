import { DraftSchema, type Draft, type TriagedRequest } from "@triage/shared";
import { COMPOSE_SYSTEM } from "../prompts.js";
import { getAcknowledgementWindow } from "../domain/sla.js";
import type { LlmProvider } from "../providers/types.js";

export async function redraftRequest(request: TriagedRequest, tone: "standard" | "formal" | "warmer" | "shorter", provider: LlmProvider): Promise<Draft> {
  const result = await provider.generateJson({
    system: `${COMPOSE_SYSTEM}\nRequested revision tone: ${tone}. Preserve factual safety and the final routing decision.`,
    user: JSON.stringify({ stage: "compose", text: request.raw_text, final: request.final, sla: request.sla, acknowledge_window: getAcknowledgementWindow(request.final.priority), senderName: request.sender_name, channel: request.channel, directives: request.analysis.risk_signals.includes("security_incident") ? ["Preserve containment language and do not request additional customer data."] : [] }),
    schema: DraftSchema,
    temperature: tone === "shorter" ? 0.25 : 0.45,
    maxOutputTokens: request.channel === "chat" ? 500 : 900
  });
  return result.data;
}
