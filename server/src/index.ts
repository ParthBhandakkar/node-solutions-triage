import "dotenv/config";
import cors from "cors";
import helmet from "helmet";
import express, { type Express, type Request } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BatchInputSchema, PatchRequestSchema, TriageInputSchema, type Priority, type TriagedRequest } from "@triage/shared";
import { createProvider } from "./providers/index.js";
import type { LlmProvider } from "./providers/types.js";
import { triageRequest, getConfigForClient } from "./pipeline/triage.js";
import { redraftRequest } from "./pipeline/compose.js";
import { createStore } from "./store/factory.js";
import type { RequestStore } from "./store/types.js";
import { errorHandler } from "./middleware/errors.js";
import { requestId } from "./middleware/requestId.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { demoKey } from "./middleware/demoKey.js";
import { PRIORITY_RANK } from "@triage/shared";

const currentDir = process.env.NETLIFY_FUNCTIONS === "true" ? process.cwd() : path.dirname(fileURLToPath(import.meta.url));

function queryValue(req: Request, name: string): string | undefined {
  const value = req.query[name];
  return typeof value === "string" ? value : undefined;
}

export function createApp(provider: LlmProvider, store: RequestStore): Express {
  const app = express();
  app.set("trust proxy", 1);
  const configuredOrigins = [
    ...(process.env.CORS_ORIGINS ?? "").split(","),
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.SITE_URL
  ].filter((origin): origin is string => Boolean(origin?.trim())).map((origin) => origin.trim());
  const allowedOrigins = new Set(configuredOrigins);
  const isProduction = process.env.NODE_ENV === "production";
  app.use(helmet({
    contentSecurityPolicy: isProduction ? {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    } : false
  }));
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin) || (allowedOrigins.size === 0 && process.env.NODE_ENV !== "production")) callback(null, true);
      else callback(new Error("Origin is not allowed"));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Request-ID", "X-Demo-Key"],
    credentials: false,
    maxAge: 86400
  }));
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  app.use(requestId);
  app.use(rateLimit);
  app.use(demoKey);

  app.get("/api/health", async (_req, res) => {
    const health = await provider.health();
    res.json({ ok: health.ok, provider: provider.name, model: provider.model, degraded: !provider.isLlm, detail: health.detail ?? null });
  });

  app.get("/api/config", (_req, res) => res.json(getConfigForClient(provider)));

  app.post("/api/triage", async (req, res) => {
    const input = TriageInputSchema.parse(req.body);
    const result = await triageRequest(input, provider);
    await store.create(result);
    res.status(201).json(result);
  });

  app.post("/api/triage/batch", async (req, res) => {
    const input = BatchInputSchema.parse(req.body);
    const results: TriagedRequest[] = [];
    for (let index = 0; index < input.items.length; index += 2) {
      const group = input.items.slice(index, index + 2);
      const completed = await Promise.all(group.map(async (item) => {
        const result = await triageRequest(item, provider);
        await store.create(result);
        return result;
      }));
      results.push(...completed);
    }
    res.status(201).json({ results });
  });

  app.get("/api/requests", async (req, res) => {
    let items = await store.list();
    const owner = queryValue(req, "owner");
    const priority = queryValue(req, "priority");
    const category = queryValue(req, "category");
    const status = queryValue(req, "status");
    if (owner) items = items.filter((item) => item.final.owner === owner);
    if (priority) items = items.filter((item) => item.final.priority === priority);
    if (category) items = items.filter((item) => item.final.category === category);
    if (status) items = items.filter((item) => item.status === status);
    items.sort((a, b) => PRIORITY_RANK[b.final.priority as Priority] - PRIORITY_RANK[a.final.priority as Priority] || a.sla.acknowledge_by.localeCompare(b.sla.acknowledge_by));
    res.json({ items });
  });

  app.get("/api/requests/:id", async (req, res) => {
    const item = await store.get(req.params.id);
    if (!item) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Request not found." } }); return; }
    res.json(item);
  });

  app.patch("/api/requests/:id", async (req, res) => {
    const patch = PatchRequestSchema.parse(req.body);
    const item = await store.update(req.params.id, patch);
    if (!item) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Request not found." } }); return; }
    res.json(item);
  });

  app.post("/api/requests/:id/redraft", async (req, res) => {
    const tone = req.body?.tone;
    if (!(["standard", "formal", "warmer", "shorter"] as const).includes(tone)) { res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "tone must be standard, formal, warmer, or shorter" } }); return; }
    const item = await store.get(req.params.id);
    if (!item) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Request not found." } }); return; }
    const draft = await redraftRequest(item, tone, provider);
    const updated = await store.update(item.id, { draft, status: "needs_review" });
    res.json(updated);
  });

  if (process.env.NODE_ENV === "production") {
    const webDist = path.resolve(currentDir, "../../../web/dist");
    app.use(express.static(webDist));
    app.get("*splat", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }
  app.use(errorHandler);
  return app;
}

if (process.env.NODE_ENV !== "test" && process.env.NETLIFY_FUNCTIONS !== "true") {
  void (async () => {
    const port = Number(process.env.PORT ?? 3001);
    const provider = await createProvider();
    const store = createStore();
    const app = createApp(provider, store);
    app.listen(port, () => console.log(`Triage API listening on http://localhost:${port} (${provider.name} / ${provider.model})`));
  })();
}
