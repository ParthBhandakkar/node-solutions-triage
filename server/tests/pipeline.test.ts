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

  it("bounds requested_action for complex emails without truncating raw input", async () => {
    const text = [
      "Subject: SSO outage, workspace access review, invoice dispute, and Friday deadline",
      "Our staff cannot access the client portal after an authentication update. While investigating, a spreadsheet containing fictional customer contact fields was uploaded to the wrong workspace. Please contain access, investigate the outage, review the duplicate invoice before Friday, and route the legal question to the appropriate team.",
      "Please provide a safe acknowledgement without requesting more customer data or promising a resolution time."
    ].join(" ");
    expect(text.length).toBeGreaterThan(240);

    const result = await triageRequest({ text, channel: "email", sender_name: "Alex" }, new RulesProvider());

    expect(result.raw_text).toBe(text);
    expect(result.analysis.requested_action.length).toBeLessThanOrEqual(240);
    expect(result.analysis.requested_action.endsWith("...")).toBe(true);
    expect(result.draft.internal_note.length).toBeLessThanOrEqual(700);
  });

  it("keeps a future feature idea low priority", async () => {
    const result = await triageRequest({ text: "Add dark mode. There is no deadline; this is a future update idea.", channel: "web_form" }, new RulesProvider());
    expect(result.final.priority).toBe("Low");
    expect(result.final.owner).toBe("Engineering");
    expect(result.applied_rules.map((rule) => rule.id)).toContain("EXPLICIT_NO_DEADLINE_05");
  });
});
