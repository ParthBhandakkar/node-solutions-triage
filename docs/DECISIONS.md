# Engineering decisions

## 1. Model proposes; policy decides
**Context:** one LLM call is easy to build but cannot guarantee a security incident is escalated. **Decision:** keep policy as pure TypeScript outside the model. **Tradeoff:** more code and an extra conceptual stage, but rules are testable, explainable, and provider-independent.

## 2. Two model stages
**Context:** composing before policy would let a wrong model priority leak into the response. **Decision:** analyze first, policy second, compose third. **Tradeoff:** two LLM calls and higher latency; final drafts reflect the actual final decision.

## 3. Locked taxonomy with Zod
**Context:** free-form labels make routing brittle. **Decision:** shared enum schemas validate provider output, API input, and frontend types. **Tradeoff:** a new category requires a deliberate code/config change rather than appearing automatically.

## 4. Category and owner are separate
**Context:** a portal outage is Technical even when the sender says “please help”; Engineering is the resolver. **Decision:** store both fields and expose the difference in the UI. **Tradeoff:** the model prompt and UI have two related concepts to explain.

## 5. Local Ollama plus Gemini adapter
**Context:** the challenge forbids spending money and request 05 is data-sensitive. **Decision:** record with local Ollama, keep Gemini as a deployable adapter. **Tradeoff:** local quality/latency depends on hardware; cloud hosting requires a provider key and has privacy/quota considerations.

## 6. Deterministic fallback is a real mode
**Context:** reviewers may have no key or local model. **Decision:** fallback uses lexicons, policy, and safe templates rather than returning an error. **Tradeoff:** it is less expressive, capped at low confidence, and always asks for review.

## 7. JSON file store for prototype scope
**Context:** a database adds setup/native-build risk for a two-day prototype. **Decision:** a small store behind an interface writes validated JSON with a serialized write queue. **Tradeoff:** it is not multi-instance safe; replace it with Postgres/SQLite and migrations before real use.

## 8. Placeholders instead of invented facts
**Context:** a draft must not invent a meeting time, price, ticket number, or completed action. **Decision:** compose prompts require `[square bracket]` placeholders and the UI highlights them. **Tradeoff:** a human has one more editing step, but the error is visible.

## 9. Review is a first-class state
**Context:** model confidence and fallback output are not reliable enough to auto-send. **Decision:** low confidence, suspicious input, fallback output, and edits set `needs_review`; approval is explicit. **Tradeoff:** no fully autonomous send flow in this prototype.

## 10. Measure the baseline
**Context:** demo examples alone do not show generalization. **Decision:** include six challenge examples plus six stress cases and report exact/tolerant/critical-miss metrics. **Tradeoff:** the labels are a single-author small sample and must not be represented as production accuracy.
