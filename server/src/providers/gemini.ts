import { GoogleGenAI } from "@google/genai";
import { parseJsonWithSchema, schemaError } from "../util/jsonRepair.js";
import type { GenerateInput, LlmProvider, ProviderResult } from "./types.js";

export class GeminiProvider implements LlmProvider {
  readonly name = "Gemini";
  readonly model: string;
  readonly isLlm = true;
  private readonly client: GoogleGenAI;

  constructor(apiKey = process.env.GEMINI_API_KEY ?? "", model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite") {
    if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: "Configured; availability is checked on first request" };
  }

  private async rawGenerate(system: string, user: string, temperature: number, maxOutputTokens: number): Promise<{ raw: string; usage: { input: number; output: number } | null }> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: user,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        temperature,
        maxOutputTokens
      }
    });
    const raw = response.text;
    if (!raw) throw new Error("Gemini returned an empty response");
    const usage = response.usageMetadata;
    return { raw, usage: usage ? { input: usage.promptTokenCount ?? 0, output: usage.candidatesTokenCount ?? 0 } : null };
  }

  async generateJson<T>(input: GenerateInput<T>): Promise<ProviderResult<T>> {
    const started = Date.now();
    let generated = await this.rawGenerate(input.system, input.user, input.temperature, input.maxOutputTokens);
    try {
      const parsed = parseJsonWithSchema(generated.raw, input.schema);
      return { data: parsed.data, raw: generated.raw, usage: generated.usage, latencyMs: Date.now() - started, repaired: parsed.repaired };
    } catch {
      generated = await this.rawGenerate(input.system, `${input.user}\n\nYour previous JSON was invalid. Return only valid JSON. Validation issue: ${schemaError(generated.raw, input.schema)}`, input.temperature, input.maxOutputTokens);
      const parsed = parseJsonWithSchema(generated.raw, input.schema);
      return { data: parsed.data, raw: generated.raw, usage: generated.usage, latencyMs: Date.now() - started, repaired: true };
    }
  }
}
