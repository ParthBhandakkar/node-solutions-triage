# Evaluation

## Command

```bash
npm run eval
```

The default evaluator uses `RulesProvider`, so it is free, deterministic, and available even without Ollama or Gemini. Set `EVAL_PROVIDER=auto` to use the configured provider. The runner writes `eval/results.md` and prints the same report.

## Golden set

`eval/golden.json` contains the six challenge examples and six additional cases:

- the security request with an instruction-injection suffix;
- partial SSO outage with a same-day board demo;
- an intentionally vague follow-up;
- repeat overbilling with legal language;
- a multi-intent slow portal plus seat expansion;
- typo-heavy portal outage text.

Expected labels were written before running the evaluator. A critical miss is defined as a known Urgent item being returned below High. That metric is more operationally meaningful than treating Medium/High disagreement as an absolute truth.

## Current baseline result

Generated on the local deterministic provider after the policy/fallback tuning pass:

| Metric | Result |
|---|---:|
| Category exact accuracy | 100% |
| Priority exact accuracy | 100% |
| Priority tolerant accuracy (±1 band) | 100% |
| Owner exact accuracy | 100% |
| Critical misses | 0 |

These results are evidence that the coded fallback covers the selected examples, not proof of production performance. The set is small, synthetic, single-author, and intentionally aligned to the requirements. A real launch needs a larger, independently annotated set, confusion analysis by customer segment/channel, and monitoring for drift.

## Automated tests

The focused Vitest suite covers:

- all six required routing decisions;
- data-exposure escalation and injection resistance;
- explicit no-deadline behavior;
- commercial-intent routing;
- fenced/trailing-comma JSON repair and schema rejection;
- end-to-end rules pipeline output, status, safety tags, and low-priority behavior.
