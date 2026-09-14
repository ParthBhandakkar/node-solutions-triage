import type { LlmProvider } from "./types.js";
import { GeminiProvider } from "./gemini.js";
import { GroqProvider } from "./groq.js";
import { OllamaProvider } from "./ollama.js";
import { RulesProvider } from "./rules.js";

export async function createProvider(): Promise<LlmProvider> {
  const requested = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  if (requested === "rules") return new RulesProvider();
  if (requested === "groq") return new GroqProvider();
  if (requested === "gemini") return new GeminiProvider();
  if (requested === "ollama") return new OllamaProvider();

  if (process.env.GROQ_API_KEY) return new GroqProvider();
  if (process.env.GEMINI_API_KEY) return new GeminiProvider();
  const ollama = new OllamaProvider();
  if ((await ollama.health()).ok) return ollama;
  return new RulesProvider();
}

export { GeminiProvider } from "./gemini.js";
export { GroqProvider } from "./groq.js";
export { OllamaProvider } from "./ollama.js";
export { RulesProvider } from "./rules.js";
export type * from "./types.js";
