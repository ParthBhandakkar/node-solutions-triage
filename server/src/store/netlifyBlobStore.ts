import { getStore } from "@netlify/blobs";
import { TriagedRequestSchema, type PatchRequest, type TriagedRequest } from "@triage/shared";
import type { RequestStore } from "./types.js";

const STORE_NAME = "triage-requests";

export class NetlifyBlobRequestStore implements RequestStore {
  private readonly store = getStore({ name: STORE_NAME, consistency: "strong" });

  async list(): Promise<TriagedRequest[]> {
    const { blobs } = await this.store.list();
    const items = await Promise.all(blobs.map(async ({ key }) => this.get(key)));
    return items.filter((item): item is TriagedRequest => item !== undefined)
      .sort((a, b) => b.received_at.localeCompare(a.received_at));
  }

  async get(id: string): Promise<TriagedRequest | undefined> {
    const value = await this.store.get(id, { type: "json", consistency: "strong" }) as unknown;
    if (value === null) return undefined;
    return TriagedRequestSchema.parse(value);
  }

  async create(request: TriagedRequest): Promise<TriagedRequest> {
    await this.store.setJSON(request.id, request);
    return request;
  }

  async update(id: string, patch: PatchRequest): Promise<TriagedRequest | undefined> {
    const existing = await this.get(id);
    if (!existing) return undefined;
    const humanEdits = [...existing.human_edits];
    const at = new Date().toISOString();
    for (const field of ["category", "priority", "owner", "status"] as const) {
      const value = patch[field];
      if (value !== undefined && field !== "status" && value !== existing.final[field]) {
        humanEdits.push({ at, field: `final.${field}`, from: String(existing.final[field]), to: String(value) });
      }
      if (value !== undefined && field === "status" && value !== existing.status) {
        humanEdits.push({ at, field, from: existing.status, to: value });
      }
    }
    if (patch.draft) {
      for (const field of ["subject", "body", "internal_note", "next_steps"] as const) {
        const value = patch.draft[field];
        if (value !== undefined) humanEdits.push({ at, field: `draft.${field}`, from: JSON.stringify(existing.draft[field]), to: JSON.stringify(value) });
      }
    }
    const updated = TriagedRequestSchema.parse({
      ...existing,
      final: { ...existing.final, ...(patch.category ? { category: patch.category } : {}), ...(patch.priority ? { priority: patch.priority } : {}), ...(patch.owner ? { owner: patch.owner } : {}) },
      draft: { ...existing.draft, ...patch.draft },
      status: patch.status ?? (patch.draft ? "needs_review" : existing.status),
      human_edits: humanEdits
    });
    await this.store.setJSON(id, updated);
    return updated;
  }
}
