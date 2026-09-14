import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRIORITY_RANK, type Channel, type Priority } from "@triage/shared";
import { triageRequest } from "../server/src/pipeline/triage.js";
import { RulesProvider } from "../server/src/providers/rules.js";
import { createProvider } from "../server/src/providers/index.js";

type Golden = { label: string; text: string; channel: Channel; expected: { category: string; priority: Priority; owner: string } };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const golden = JSON.parse(await readFile(path.resolve(root, "eval/golden.json"), "utf8")) as Golden[];
const provider = process.env.EVAL_PROVIDER === "rules" || !process.env.EVAL_PROVIDER ? new RulesProvider() : await createProvider();
const rows: Array<Golden & { actual: { category: string; priority: Priority; owner: string }; category: boolean; priority: boolean; owner: boolean; distance: number; criticalMiss: boolean; ms: number }> = [];

for (const item of golden) {
  const started = Date.now();
  const result = await triageRequest({ text: item.text, channel: item.channel }, provider);
  const actual = result.final;
  const distance = Math.abs(PRIORITY_RANK[actual.priority] - PRIORITY_RANK[item.expected.priority]);
  rows.push({ ...item, actual: { category: actual.category, priority: actual.priority, owner: actual.owner }, category: actual.category === item.expected.category, priority: actual.priority === item.expected.priority, owner: actual.owner === item.expected.owner, distance, criticalMiss: item.expected.priority === "Urgent" && PRIORITY_RANK[actual.priority] < PRIORITY_RANK.High, ms: Date.now() - started });
}

const accuracy = (field: "category" | "priority" | "owner") => Math.round((rows.filter((row) => row[field]).length / rows.length) * 100);
const tolerantPriority = Math.round((rows.filter((row) => row.distance <= 1).length / rows.length) * 100);
const criticalMisses = rows.filter((row) => row.criticalMiss).length;
const lines = [
  "# Triage evaluation results", "", `Provider: **${provider.name} / ${provider.model}**`, `Cases: **${rows.length}**`, "",
  "| Metric | Result |", "|---|---:|", `| Category exact accuracy | ${accuracy("category")}% |`, `| Priority exact accuracy | ${accuracy("priority")}% |`, `| Priority tolerant accuracy (±1 band) | ${tolerantPriority}% |`, `| Owner exact accuracy | ${accuracy("owner")}% |`, `| Critical misses (Urgent labelled below High) | **${criticalMisses}** |`, "", "| Case | Expected | Actual | Category | Priority | Owner | Critical miss |", "|---|---|---|:---:|:---:|:---:|:---:|",
  ...rows.map((row) => `| ${row.label} | ${row.expected.category} / ${row.expected.priority} / ${row.expected.owner} | ${row.actual.category} / ${row.actual.priority} / ${row.actual.owner} | ${row.category ? "✓" : "✗"} | ${row.priority ? "✓" : row.distance <= 1 ? "≈" : "✗"} | ${row.owner ? "✓" : "✗"} | ${row.criticalMiss ? "YES" : "no"} |`), "", "## Interpretation", "", "Exact category and owner matches are useful for a small prototype but are not a production accuracy claim. The critical-miss metric is intentionally stricter: any known Urgent request routed below High is treated as an operational failure. Labels are a single-person golden set and should be reviewed with real team annotations before launch."
];
const output = `${lines.join("\n")}\n`;
await writeFile(path.resolve(root, "eval/results.md"), output, "utf8");
console.log(output);
