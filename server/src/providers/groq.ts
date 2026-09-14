import Groq from "groq-sdk";
import { z } from "zod";
import { parseJsonWithSchema, schemaError } from "../util/jsonRepair.js";
import type { GenerateInput, LlmProvider, ProviderResult } from "./types.js";

function jsonSchemaFor<T>(schema: z.ZodType<T>): Record<string, unknown> {
  const generated = z.toJSONSchema(schema) as Record<string, unknown>;
  delete generated.$schema;
  return generated;
}

export class GroqProvider implements LlmProvider {
  readonly name = "Groq";
  readonly model: string;
  readonly isLlm = true;
  private readonly client: Groq;

  constructor(apiKey = process.env.GROQ_API_KEY ?? "", model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b") {
    if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
    this.client = new Groq({ apiKey, timeout: 30000, maxRetries: 0 });
    this.model = model;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: "Configured; availability is checked on first request" };
  }

  private async rawGenerate<T>(input: GenerateInput<T>, user: string): Promise<{ raw: string; usage: { input: number; output: number } | null }> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: user }
      ],
      temperature: input.temperature,
      max_tokens: input.maxOutputTokens,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "triage_output",
          strict: true,
          schema: jsonSchemaFor(input.schema)
        }
      }
    });
    const raw = response.choices[0]?.message?.content;
    if (!raw) throw new Error("Groq returned an empty response");
    return { raw, usage: response.usage ? { input: response.usage.prompt_tokens, output: response.usage.completion_tokens } : null };
  }

  async generateJson<T>(input: GenerateInput<T>): Promise<ProviderResult<T>> {
    const started = Date.now();
    let generated = await this.rawGenerate(input, input.user);
    try {
      const parsed = parseJsonWithSchema(generated.raw, input.schema);
      return { data: parsed.data, raw: generated.raw, usage: generated.usage, latencyMs: Date.now() - started, repaired: parsed.repaired };
    } catch {
      const correction = `${input.user}\n\nReturn only JSON that satisfies the provided schema. Correct the previous output. Validation issue: ${schemaError(generated.raw, input.schema)}`;
      generated = await this.rawGenerate(input, correction);
      const parsed = parseJsonWithSchema(generated.raw, input.schema);
      return { data: parsed.data, raw: generated.raw, usage: generated.usage, latencyMs: Date.now() - started, repaired: true };
    }
  }
}
