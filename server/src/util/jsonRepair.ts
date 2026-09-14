import type { z } from "zod";

export type ParsedJson<T> = { data: T; repaired: boolean };

function extractObject(raw: string): string {
  const withoutFences = raw.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end <= start) return withoutFences;
  return withoutFences.slice(start, end + 1);
}

export function parseJsonWithSchema<T>(raw: string, schema: z.ZodType<T>): ParsedJson<T> {
  const extracted = extractObject(raw);
  const candidates = [extracted, extracted.replace(/,\s*([}\]])/g, "$1")];
  let lastError: unknown;
  for (let index = 0; index < candidates.length; index += 1) {
    try {
      const parsed: unknown = JSON.parse(candidates[index] ?? "");
      const result = schema.safeParse(parsed);
      if (result.success) return { data: result.data, repaired: index > 0 || extracted !== raw.trim() };
      lastError = result.error;
    } catch (error) {
      lastError = error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : "schema validation failed";
  throw new Error(`Structured output could not be parsed: ${detail}`);
}

export function schemaError<T>(raw: string, schema: z.ZodType<T>): string {
  try {
    const parsed: unknown = JSON.parse(extractObject(raw));
    const result = schema.safeParse(parsed);
    return result.success ? "unknown structured-output error" : result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
  } catch (error) {
    return error instanceof Error ? error.message : "invalid JSON";
  }
}
