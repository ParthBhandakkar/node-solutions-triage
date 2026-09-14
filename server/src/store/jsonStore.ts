import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { TriagedRequestSchema, type PatchRequest, type TriagedRequest } from "@triage/shared";
import type { RequestStore } from "./types.js";

function defaultStorePath(): string {
  const serverRoot = path.basename(process.cwd()) === "server" ? process.cwd() : path.resolve(process.cwd(), "server");
  return path.resolve(serverRoot, "data/requests.json");
}

export class JsonRequestStore implements RequestStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = defaultStorePath()) { this.filePath = filePath; }

  private async readAll(): Promise<TriagedRequest[]> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(content);
      return Array.isArray(parsed) ? parsed.map((item) => TriagedRequestSchema.parse(item)) : [];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async writeAll(items: TriagedRequest[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    this.writeQueue = this.writeQueue.then(() => writeFile(this.filePath, `${JSON.stringify(items, null, 2)}\n`, "utf8"));
    await this.writeQueue;
  }

  async list(): Promise<TriagedRequest[]> { return this.readAll(); }

  async get(id: string): Promise<TriagedRequest | undefined> { return (await this.readAll()).find((item) => item.id === id); }

  async create(request: TriagedRequest): Promise<TriagedRequest> {
    const items = await this.readAll();
    items.unshift(request);
    await this.writeAll(items);
    return request;
  }

  async update(id: string, patch: PatchRequest): Promise<TriagedRequest | undefined> {
    const items = await this.readAll();
    const index = items.findIndex((item) => item.id === id);
    const existing = items[index];
    if (index < 0 || !existing) return undefined;
    const humanEdits = [...existing.human_edits];
    const at = new Date().toISOString();
    for (const field of ["category", "priority", "owner", "status"] as const) {
      const value = patch[field];
      if (value !== undefined && field !== "status" && value !== existing.final[field]) {
        humanEdits.push({ at, field: `final.${field}`, from: String(existing.final[field]), to: String(value) });
      }
      if (value !== undefined && field === "status" && value !== existing.status) humanEdits.push({ at, field, from: existing.status, to: value });
    }
    if (patch.draft) {
      for (const field of ["subject", "body", "internal_note", "next_steps"] as const) {
        const value = patch.draft[field];
        if (value !== undefined) humanEdits.push({ at, field: `draft.${field}`, from: JSON.stringify(existing.draft[field]), to: JSON.stringify(value) });
      }
    }
    const updated: TriagedRequest = TriagedRequestSchema.parse({
      ...existing,
      final: { ...existing.final, ...(patch.category ? { category: patch.category } : {}), ...(patch.priority ? { priority: patch.priority } : {}), ...(patch.owner ? { owner: patch.owner } : {}) },
      draft: { ...existing.draft, ...patch.draft },
      status: patch.status ?? (patch.draft ? "needs_review" : existing.status),
      human_edits: humanEdits
    });
    items[index] = updated;
    await this.writeAll(items);
    return updated;
  }
}
