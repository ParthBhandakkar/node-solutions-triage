# Node Solutions · AI Request Triage Assistant

A focused prototype that turns an unstructured business request into an actionable, reviewable next step. It accepts a request, summarizes it, classifies category and priority, routes it to an owner, explains the decision, calculates an acknowledgement SLA, and drafts a professional first response.

> **Safety thesis:** the model proposes, deterministic policy decides, and a human approves.

## What is included

- React + Vite operations-style inbox with detail view and four-team route board.
- Three-stage pipeline: sanitize → structured analysis → policy overrides/SLA → constrained draft.
- Ollama support for local, no-cost recording and development (`qwen3.5:9b` by default).
- Gemini support for a hosted deployment (`gemini-2.5-flash-lite` by default).
- Groq support with strict JSON Schema output (`openai/gpt-oss-20b` by default).
- Netlify Functions adapter with Netlify Blobs persistence and optional Postgres storage.
- Deterministic offline rules fallback when no LLM provider is available.
- Policy safeguards for data exposure, outages, payment deadlines, legal language, low-confidence output, vague requests, tone escalation, and prompt injection.
- Editable draft response with audit trail, review state, policy-rule explanations, confidence, latency, and generated JSON.
- Golden evaluation set containing all six challenge requests plus six stress cases.

## Run locally

Requirements: Node 20+ and npm. Node 26 was used for development. Ollama is optional.

```bash
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173. To record with the local model, set `LLM_PROVIDER=ollama` in `.env` and make sure Ollama is running with the configured model:

```bash
ollama serve
ollama run qwen3.5:9b
```

The app works without Ollama or an API key: set `LLM_PROVIDER=rules` or leave provider selection on `auto` and it will use the deterministic fallback. The UI labels fallback output honestly as `Offline rules` and marks it for human review.

## Hosted provider configuration

Groq is the recommended hosted provider for this deployment. The `.env` variable supplied locally as `groqAPI` has been normalized to `GROQ_API_KEY`; the key is ignored by git and must be configured as a host secret, never committed.

```text
NODE_ENV=production
LLM_PROVIDER=groq
GROQ_API_KEY=<your Groq key>
GROQ_MODEL=openai/gpt-oss-20b
REDACT_BEFORE_LLM=true
CORS_ORIGINS=https://<your-site>.netlify.app
DEMO_KEY=<optional shared secret>
```

Gemini remains supported as an alternative:

```text
LLM_PROVIDER=gemini
GEMINI_API_KEY=<your Google AI Studio key>
GEMINI_MODEL=gemini-2.5-flash-lite
```

## Netlify deployment

The repository includes `netlify.toml` and `netlify/functions/api.cjs`. Netlify serves `web/dist` as the frontend and routes `/api/*` to the Express API as a serverless function. The function uses Netlify Blobs for durable request storage when `NETLIFY=true`. For larger workloads, configure `DATABASE_URL` to use the indexed Postgres adapter instead.

```bash
npm install
npm run build
netlify login
netlify init
netlify env:set GROQ_API_KEY --secret
netlify env:set LLM_PROVIDER groq
netlify env:set GROQ_MODEL openai/gpt-oss-20b
netlify env:set REDACT_BEFORE_LLM true
netlify deploy --prod
```

After the site URL is known, set `CORS_ORIGINS` to that exact origin and redeploy. Do not pass API keys in a shell command, commit them, or place them in frontend variables such as `VITE_*`.

## Production safeguards

The API includes Helmet security headers, strict production CORS allowlisting, request IDs, no-store API responses, a 32 KB JSON body limit, Zod validation, a rate limiter, optional demo-key protection, provider retry/fallback handling, redaction before cloud calls, and an audit trail for human edits. Netlify Blobs is durable but not a relational query engine; use Postgres for high-volume filtering, reporting, and concurrent updates. The in-memory rate limiter is per function instance, so a large deployment should also use an external rate-limit store or the host's WAF.

Build and serve the standalone combined application locally with:

```bash
npm run build
npm start
```

The included `Dockerfile` exposes port 3001. This prototype is hardened for a hosted demo but still needs real authentication, identity-based authorization, centralized logs/metrics, managed secrets, backup/retention policy, and a reviewed privacy agreement before real client information is accepted.

## Test and evaluate

```bash
npm run typecheck
npm test
npm run eval
```

`npm run eval` uses the offline rules provider by default so it is deterministic and free. To evaluate a configured provider instead, use `EVAL_PROVIDER=auto npm run eval` or set `EVAL_PROVIDER=ollama` with `LLM_PROVIDER=ollama`. Results are written to `eval/results.md`.

The current deterministic baseline is measured against 12 cases: 100% category, 100% exact priority, 100% tolerant priority, 100% owner, and zero critical misses. This is a small, single-author golden set, not a production accuracy claim.

## API

- `POST /api/triage` with `{ "text": "...", "channel": "email", "sender_name": "..." }`
- `POST /api/triage/batch` with `{ "items": [...] }`
- `GET /api/requests` with optional `owner`, `priority`, `category`, and `status` filters
- `GET /api/requests/:id`
- `PATCH /api/requests/:id` for human corrections and draft edits
- `POST /api/requests/:id/redraft` with `tone: standard | formal | warmer | shorter`
- `GET /api/config`
- `GET /api/health`

Every request is validated with Zod. Local development uses the JSON store; Netlify Functions use Netlify Blobs; setting `DATABASE_URL` selects the indexed Postgres adapter for durable, multi-instance deployments.

## Repository map

```text
shared/       locked taxonomy and API schemas
server/       Express API, providers, policy, pipeline, stores, tests
netlify/      Serverless Express function adapter
web/          React inbox, detail pane, route board
server/config fictional organization and SLA configuration
eval/         golden set, runner, generated metrics
docs/         architecture, decisions, prompts, evaluation, deployment, video script
```

## Important tradeoffs and limitations

The two model calls cost latency but make the safety boundary clear: the final policy decision is available before the reply is composed. Category and owner are separate because an outage can be categorized as Technical and still need Engineering even when the customer asks for generic help. The fallback is deliberately functional, but its confidence is capped and it always requires review.

This remains a focused prototype: it has no identity-provider authentication, role-based authorization, email/chat ingestion, thread history, CRM context, centralized monitoring, multilingual support, or automated send approval. Netlify Blobs is suitable for this queue's durable demo storage but not for complex relational analytics; use the Postgres adapter for high-volume operation and add migrations/backups. Cloud provider usage should be reviewed against the provider's current privacy and quota terms before real data is used.

See [docs/DECISIONS.md](docs/DECISIONS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PROMPTS.md](docs/PROMPTS.md), [docs/EVALUATION.md](docs/EVALUATION.md), and [docs/VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md).
