import { AnalysisSchema, DraftSchema, type Analysis, type Draft } from "@triage/shared";
import { rulesAnalyze, rulesCompose } from "../domain/rules.js";
import type { GenerateInput, LlmProvider, ProviderResult } from "./types.js";

export class RulesProvider implements LlmProvider {
  readonly name = "Offline rules";
  readonly model = "deterministic-lexicon-v1";
  readonly isLlm = false;

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: "Deterministic fallback is always available" };
  }

  async generateJson<T>(input: GenerateInput<T>): Promise<ProviderResult<T>> {
    const started = Date.now();
    const payload = JSON.parse(input.user) as { stage?: string; text?: string; final?: Parameters<typeof rulesCompose>[0]["final"]; sla?: Parameters<typeof rulesCompose>[0]["sla"]; senderName?: string | null; channel?: string; directives?: string[] };
    let value: Analysis | Draft;
    if (payload.stage === "analyze") {
      value = rulesAnalyze(payload.text ?? "");
    } else {
      value = rulesCompose({ text: payload.text ?? "", final: payload.final!, sla: payload.sla!, senderName: payload.senderName ?? null, channel: payload.channel ?? "email", directives: payload.directives ?? [] });
    }
    const parsed = (payload.stage === "analyze" ? AnalysisSchema : DraftSchema).parse(value) as T;
    return { data: parsed, raw: JSON.stringify(value), usage: null, latencyMs: Date.now() - started, repaired: false };
  }
}
