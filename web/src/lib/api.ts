import type { BatchInput, Draft, PatchRequest, TriageInput, TriagedRequest } from "@triage/shared";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, ...init });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "object" && payload.error !== null && "message" in payload.error ? String(payload.error.message) : "Request failed";
    throw new Error(message);
  }
  return payload as T;
}

export const api = {
  health: () => request<{ ok: boolean; provider: string; model: string; degraded: boolean; detail: string | null }>("/api/health"),
  config: () => request<{ org: { name: string; signature: string; sla: Record<string, { acknowledge_minutes: number; resolve_hours: number | null; internal_action: string }> }; provider: { name: string; model: string; isLlm: boolean } }>("/api/config"),
  list: () => request<{ items: TriagedRequest[] }>("/api/requests"),
  triage: (input: TriageInput) => request<TriagedRequest>("/api/triage", { method: "POST", body: JSON.stringify(input) }),
  batch: (input: BatchInput) => request<{ results: TriagedRequest[] }>("/api/triage/batch", { method: "POST", body: JSON.stringify(input) }),
  patch: (id: string, patch: PatchRequest) => request<TriagedRequest>(`/api/requests/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  redraft: (id: string, tone: "standard" | "formal" | "warmer" | "shorter") => request<TriagedRequest>(`/api/requests/${id}/redraft`, { method: "POST", body: JSON.stringify({ tone }) })
};

export type { Draft };
