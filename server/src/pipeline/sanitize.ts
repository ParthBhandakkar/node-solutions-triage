import { redactSensitiveText } from "../util/redact.js";

export function sanitizeRequest(input: string): { text: string; redacted: boolean } {
  const normalized = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, 8000);
  const shouldRedact = process.env.REDACT_BEFORE_LLM === "true";
  return { text: shouldRedact ? redactSensitiveText(normalized) : normalized, redacted: shouldRedact };
}
