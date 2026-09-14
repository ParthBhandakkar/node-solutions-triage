import type { RequestStore } from "./types.js";
import { JsonRequestStore } from "./jsonStore.js";
import { NetlifyBlobRequestStore } from "./netlifyBlobStore.js";
import { PostgresRequestStore } from "./postgresStore.js";

export function createStore(): RequestStore {
  if (process.env.DATABASE_URL) return new PostgresRequestStore();
  if (process.env.NETLIFY === "true" || process.env.NETLIFY_FUNCTIONS === "true") return new NetlifyBlobRequestStore();
  // Local JSON remains useful for development and deterministic review of the challenge prototype.
  return new JsonRequestStore();
}
