import { Pool } from "pg";
import { TriagedRequestSchema, type PatchRequest, type TriagedRequest } from "@triage/shared";
import type { RequestStore } from "./types.js";

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS triage_requests (
    id TEXT PRIMARY KEY,
    received_at TIMESTAMPTZ NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS triage_requests_received_idx ON triage_requests (received_at DESC);
  CREATE INDEX IF NOT EXISTS triage_requests_priority_idx ON triage_requests (priority);
  CREATE INDEX IF NOT EXISTS triage_requests_owner_idx ON triage_requests (owner);
  CREATE INDEX IF NOT EXISTS triage_requests_status_idx ON triage_requests (status);
`;

export class PostgresRequestStore implements RequestStore {
  private readonly pool: Pool;
  private readonly schemaReady: Promise<void>;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error("DATABASE_URL is required for PostgresRequestStore");
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined
    });
    this.schemaReady = this.pool.query(SCHEMA_SQL).then(() => undefined);
  }

  private async ready(): Promise<void> { await this.schemaReady; }
  private parse(payload: unknown): TriagedRequest { return TriagedRequestSchema.parse(payload); }

  async list(): Promise<TriagedRequest[]> {
    await this.ready();
    const result = await this.pool.query<{ payload: unknown }>("SELECT payload FROM triage_requests ORDER BY received_at DESC");
    return result.rows.map((row) => this.parse(row.payload));
  }

  async get(id: string): Promise<TriagedRequest | undefined> {
    await this.ready();
    const result = await this.pool.query<{ payload: unknown }>("SELECT payload FROM triage_requests WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? this.parse(row.payload) : undefined;
  }

  async create(request: TriagedRequest): Promise<TriagedRequest> {
    await this.ready();
    await this.pool.query(
      "INSERT INTO triage_requests (id, received_at, category, priority, owner, status, payload) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)",
      [request.id, request.received_at, request.final.category, request.final.priority, request.final.owner, request.status, JSON.stringify(request)]
    );
    return request;
  }

  async update(id: string, patch: PatchRequest): Promise<TriagedRequest | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;
    const humanEdits = [...existing.human_edits];
    const at = new Date().toISOString();
    for (const field of ["category", "priority", "owner", "status"] as const) {
      const value = patch[field];
      if (value !== undefined && field !== "status" && value !== existing.final[field]) humanEdits.push({ at, field: `final.${field}`, from: String(existing.final[field]), to: String(value) });
      if (value !== undefined && field === "status" && value !== existing.status) humanEdits.push({ at, field, from: existing.status, to: value });
    }
    if (patch.draft) {
      for (const field of ["subject", "body", "internal_note", "next_steps"] as const) {
        const value = patch.draft[field];
        if (value !== undefined) humanEdits.push({ at, field: `draft.${field}`, from: JSON.stringify(existing.draft[field]), to: JSON.stringify(value) });
      }
    }
    const updated = this.parse({
      ...existing,
      final: { ...existing.final, ...(patch.category ? { category: patch.category } : {}), ...(patch.priority ? { priority: patch.priority } : {}), ...(patch.owner ? { owner: patch.owner } : {}) },
      draft: { ...existing.draft, ...patch.draft },
      status: patch.status ?? (patch.draft ? "needs_review" : existing.status),
      human_edits: humanEdits
    });
    await this.ready();
    const result = await this.pool.query(
      "UPDATE triage_requests SET category = $2, priority = $3, owner = $4, status = $5, payload = $6::jsonb WHERE id = $1",
      [id, updated.final.category, updated.final.priority, updated.final.owner, updated.status, JSON.stringify(updated)]
    );
    return result.rowCount ? updated : undefined;
  }
}
