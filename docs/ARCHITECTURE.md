# Architecture

## End-to-end flow

```text
┌──────────────┐   ┌────────────┐   ┌──────────────────┐   ┌───────────────┐   ┌──────────────┐
│ textarea/API │──▶│ sanitize   │──▶│ analyze JSON     │──▶│ policy + SLA  │──▶│ compose JSON │
└──────────────┘   └────────────┘   │ Ollama/Gemini  │   │ pure TS rules │   │ constrained  │
                                    │ or offline     │   └──────┬────────┘   └──────┬───────┘
                                    └─────────────────┘          │                   │
                                                               ▼                   ▼
                                                        final decision       human review UI
                                                        + rule audit         + JSON store
```

## Responsibilities

1. **Sanitize** trims input, removes control characters, caps the request at 8,000 characters, optionally redacts emails/phone-like strings, and wraps the text as untrusted `<request>` data.
2. **Analyze** asks the selected provider for one Zod-valid JSON object containing summary, category, priority/reason, owner/reason, risk signals, entities, tone, questions, and confidence.
3. **Policy** is deterministic TypeScript. It can raise priority but not silently lower a safety floor, override routing, add secondary notifications/tags, require human review, and record the rule plus reason. It is independent of model provider.
4. **SLA** reads `server/config/org.json` and computes acknowledgement/resolution targets. The model receives the computed window; it never invents one.
5. **Compose** receives the final policy output and writes a reviewable draft. It cannot change category, priority, owner, or the organization SLA.
6. **Store/API** persists the complete trace, including pre-policy analysis, final decision, rules, SLA, draft, status, metadata, and human edit audit trail.
7. **Web UI** presents the queue, decision rationale, risk banners, editable draft, route board, and under-the-hood diagnostics.

## Provider strategy

`createProvider()` uses an explicit `LLM_PROVIDER` first. In auto mode it selects Gemini when a key exists, then healthy local Ollama, then the rules provider. The rules provider implements the same JSON contract and uses the same policy function, so a reviewer can run the app without installing a model or providing a key.

Ollama is the recording path because it keeps the mock requests local. Gemini is implemented as the hosted path because a cloud host cannot reach a laptop's local Ollama process. A public deployment should use synthetic data only and set `DEMO_KEY`.

## Failure handling

Provider responses request JSON and are parsed with a strict Zod schema. The parser strips Markdown fences, extracts the object, removes trailing commas, validates, then retries once with the validation error. If the configured provider is unavailable, auto mode chooses the rules provider. Fallback output is marked `degraded` and `needs_human_review` rather than being presented as equivalent to an LLM result.

## Security boundary illustrated by request 05

The model may classify a wrong-workspace customer-data upload inconsistently. The external policy layer matches both model risk signals and independent text patterns, forces Technical/Urgent/Engineering, notifies Client Success, adds containment tags, and changes the composition directive. This protects the critical action even when the language model is wrong or the request contains an instruction-injection attempt.

## Hosted deployment architecture

The Netlify deployment serves `web/dist` from the CDN and rewrites `/api/*` to `netlify/functions/api.mjs`. That function constructs the same Express app, provider factory, policy pipeline, and store factory used locally. `GROQ_API_KEY` is server-only. Netlify Blobs provides strong-consistency durable storage for the hosted prototype; `DATABASE_URL` switches the store to indexed Postgres for high-volume deployments.

The production boundary adds Helmet headers, strict origin allowlisting, request IDs, no-store API responses, 32 KB payload limits, and a per-instance rate limiter. The per-instance limiter is intentionally not described as a global control: at scale it should be paired with a WAF or shared Redis/Upstash limiter. Authentication and tenant authorization remain required next steps before real client traffic.
