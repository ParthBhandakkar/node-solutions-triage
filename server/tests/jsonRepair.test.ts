import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonWithSchema } from "../src/util/jsonRepair.js";

describe("structured output parser", () => {
  const schema = z.object({ label: z.string(), count: z.number() });
  it("parses native JSON without marking it repaired", () => {
    const result = parseJsonWithSchema('{"label":"ok","count":2}', schema);
    expect(result.data).toEqual({ label: "ok", count: 2 });
    expect(result.repaired).toBe(false);
  });
  it("extracts fenced JSON and removes trailing commas", () => {
    const result = parseJsonWithSchema('Here is the result:\n```json\n{"label":"ok","count":2,}\n```', schema);
    expect(result.data.label).toBe("ok");
    expect(result.repaired).toBe(true);
  });
  it("rejects JSON that does not satisfy the schema", () => {
    expect(() => parseJsonWithSchema('{"label":4,"count":"two"}', schema)).toThrow(/could not be parsed/i);
  });
});
