import type { z } from "zod";
import { parseJsonWithSchema, schemaError } from "../util/jsonRepair.js";
import type { GenerateInput, LlmProvider, ProviderResult } from "./types.js";

type OllamaResponse = { response?: string; prompt_eval_count?: number; eval_count?: number };

export class OllamaProvider implements LlmProvider {
  readonly name = "Ollama";
  readonly model: string;
  readonly isLlm = true;
  private readonly url: string;

  constructor(url = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434", model = process.env.OLLAMA_MODEL ?? "qwen3.5:9b") {
    this.url = url.replace(/\/$/, "");
    this.model = model;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const response = await fetch(`${this.url}/api/tags`, { signal: AbortSignal.timeout(800) });
      return response.ok ? { ok: true } : { ok: false, detail: `HTTP ${response.status}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "Ollama unavailable" };
    }
  }

  private async rawGenerate(system: string, user: string, temperature: number, maxOutputTokens: number): Promise<{ raw: string; usage: { input: number; output: number } | null }> {
    const response = await fetch(`${this.url}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: this.model,
        system,
        prompt: user,
        stream: false,
        format: "json",
        think: false,
        options: { temperature, num_predict: maxOutputTokens }
      })
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const body = await response.json() as OllamaResponse;
    if (!body.response) throw new Error("Ollama returned an empty response");
    return { raw: body.response, usage: body.prompt_eval_count || body.eval_count ? { input: body.prompt_eval_count ?? 0, output: body.eval_count ?? 0 } : null };
  }

  async generateJson<T>(input: GenerateInput<T>): Promise<ProviderResult<T>> {
    const started = Date.now();
    let generated = await this.rawGenerate(input.system, input.user, input.temperature, input.maxOutputTokens);
    try {
      const parsed = parseJsonWithSchema(generated.raw, input.schema);
      return { data: parsed.data, raw: generated.raw, usage: generated.usage, latencyMs: Date.now() - started, repaired: parsed.repaired };
    } catch {
      const correction = `${input.user}\n\nReturn only valid JSON matching the requested schema. Correct the previous output. Validation issue: ${schemaError(generated.raw, input.schema)}`;
      generated = await this.rawGenerate(input.system, correction, input.temperature, input.maxOutputTokens);
      const parsed = parseJsonWithSchema(generated.raw, input.schema);
      return { data: parsed.data, raw: generated.raw, usage: generated.usage, latencyMs: Date.now() - started, repaired: true };
    }
  }
}
