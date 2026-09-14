import type { z } from "zod";

export type ProviderUsage = { input: number; output: number };

export type GenerateInput<T> = {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature: number;
  maxOutputTokens: number;
};

export type ProviderResult<T> = {
  data: T;
  raw: string;
  usage: ProviderUsage | null;
  latencyMs: number;
  repaired: boolean;
};

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  readonly isLlm: boolean;
  generateJson<T>(input: GenerateInput<T>): Promise<ProviderResult<T>>;
  health(): Promise<{ ok: boolean; detail?: string }>;
}
