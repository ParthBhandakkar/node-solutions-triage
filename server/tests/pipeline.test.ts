import { describe, expect, it } from "vitest";
import { RulesProvider } from "../src/providers/rules.js";
import { triageRequest } from "../src/pipeline/triage.js";

describe("triage pipeline", () => {
  it("returns a reviewable, schema-valid security result", async () => {
    const result = await triageRequest({
      text: "We accidentally uploaded a spreadsheet containing customer contact information to the wrong workspace. We need immediate help removing access.",
      channel: "email",
      sender_name: "Alex"
    }, new RulesProvider());
    expect(result.final.priority).toBe("Urgent");
    expect(result.final.owner).toBe("Engineering");
    expect(result.final.tags).toEqual(expect.arrayContaining(["security_incident", "pii", "containment"]));
    expect(result.applied_rules.map((rule) => rule.id)).toContain("DATA_EXPOSURE_01");
    expect(result.draft.body).toMatch(/wrong workspace/i);
    expect(result.status).toBe("needs_review");
    expect(result.meta.degraded).toBe(true);
  });

  it("keeps a future feature idea low priority", async () => {
    const result = await triageRequest({ text: "Add dark mode. There is no deadline; this is a future update idea.", channel: "web_form" }, new RulesProvider());
    expect(result.final.priority).toBe("Low");
    expect(result.final.owner).toBe("Engineering");
    expect(result.applied_rules.map((rule) => rule.id)).toContain("EXPLICIT_NO_DEADLINE_05");
  });
});
