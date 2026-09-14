# Production deployment

## Provider

Set `LLM_PROVIDER=groq`, `GROQ_API_KEY`, and `GROQ_MODEL=openai/gpt-oss-20b` in the host secret manager. The API key is server-only; never use a `VITE_` prefix and never commit `.env`. `auto` also selects Groq when `GROQ_API_KEY` is present, followed by Gemini, Ollama, and offline rules.

Groq output requests strict JSON Schema for supported models and still passes through local Zod validation, retry logic, and the deterministic policy layer. A provider response cannot bypass the `DATA_EXPOSURE_01` or outage safeguards.

## Netlify shape

```text
Netlify CDN
  ├── /                  → web/dist/index.html and assets
  └── /api/*             → netlify/functions/api.mjs
                              └── Express app
                                  ├── Groq provider
                                  ├── policy + triage pipeline
                                  └── Netlify Blobs store
```

`netlify.toml` sets the build command, frontend publish directory, function directory, esbuild bundling, API rewrite, and SPA fallback. The function sets `NETLIFY_FUNCTIONS=true` before importing the compiled server so the server does not call `listen()` inside the Lambda runtime.

## Storage selection

- Local development: `JsonRequestStore`, ignored under `server/data`.
- Netlify Functions: `NetlifyBlobRequestStore`, strong-consistency site-wide store named `triage-requests`.
- Multi-instance/high-volume deployment: set `DATABASE_URL` and the factory selects `PostgresRequestStore`. It creates a small indexed table for request payload, owner, priority, category, status, and received time.

Netlify Blobs is a durable key/value store and the current list endpoint reads stored request keys, so it is appropriate for a small queue/demo. Postgres is the correct path for high-volume queries, reporting, concurrent updates, retention policies, and operational analytics.

## Security controls

- `.env` and all `.env.*` files except `.env.example` are ignored.
- Helmet adds baseline security headers.
- Production CORS accepts only `CORS_ORIGINS`, `URL`, `DEPLOY_PRIME_URL`, and `SITE_URL` values.
- JSON bodies are capped at 32 KB.
- Every response receives an `X-Request-ID`.
- API responses are marked `Cache-Control: no-store`.
- A per-instance limiter rejects excessive traffic; use Netlify WAF or Redis/Upstash for a global limiter at scale.
- `DEMO_KEY` can protect a small demo; production should use an identity provider and role-based access control instead.
- `REDACT_BEFORE_LLM=true` is enabled in the Netlify production context.
- Human edits are retained as an audit trail.
- Provider failure falls back to deterministic output and marks the result for review.

## CLI deployment sequence

```bash
gh auth login
gh repo create node-solutions-triage --private --source=. --remote=origin --push
netlify login
netlify init
netlify env:set GROQ_API_KEY --secret
netlify env:set LLM_PROVIDER groq
netlify env:set GROQ_MODEL openai/gpt-oss-20b
netlify env:set REDACT_BEFORE_LLM true
npm run build
netlify deploy --prod
```

Set `CORS_ORIGINS` to the final Netlify origin after the first deployment and redeploy. Verify `/api/health`, a synthetic request, and the frontend root before sharing the URL.

## Large-scale next steps

Before real client traffic: add SSO/OIDC authentication, tenant and role checks, a global rate-limit store, structured logs and traces, alerting, model-cost budgets, queue-based background processing, database migrations, encrypted backup/retention controls, provider circuit breakers, and a red-team/privacy review. The current implementation provides the boundaries and adapters but does not claim those operational systems are already configured.
