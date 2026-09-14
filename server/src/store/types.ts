import type { PatchRequest, TriagedRequest } from "@triage/shared";

export interface RequestStore {
  list(): Promise<TriagedRequest[]>;
  get(id: string): Promise<TriagedRequest | undefined>;
  create(request: TriagedRequest): Promise<TriagedRequest>;
  update(id: string, patch: PatchRequest): Promise<TriagedRequest | undefined>;
}
