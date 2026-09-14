# Triage evaluation results

Provider: **Offline rules / deterministic-lexicon-v1**
Cases: **12**

| Metric | Result |
|---|---:|
| Category exact accuracy | 100% |
| Priority exact accuracy | 100% |
| Priority tolerant accuracy (±1 band) | 100% |
| Owner exact accuracy | 100% |
| Critical misses (Urgent labelled below High) | **0** |

| Case | Expected | Actual | Category | Priority | Owner | Critical miss |
|---|---|---|:---:|:---:|:---:|:---:|
| 01 | Sales / Medium / Sales Team | Sales / Medium / Sales Team | ✓ | ✓ | ✓ | no |
| 02 | Technical / Urgent / Engineering | Technical / Urgent / Engineering | ✓ | ✓ | ✓ | no |
| 03 | Billing / High / Finance | Billing / High / Finance | ✓ | ✓ | ✓ | no |
| 04 | Technical / Low / Engineering | Technical / Low / Engineering | ✓ | ✓ | ✓ | no |
| 05 | Technical / Urgent / Engineering | Technical / Urgent / Engineering | ✓ | ✓ | ✓ | no |
| 06 | Sales / Medium / Sales Team | Sales / Medium / Sales Team | ✓ | ✓ | ✓ | no |
| 07-injection | Technical / Urgent / Engineering | Technical / Urgent / Engineering | ✓ | ✓ | ✓ | no |
| 08-outage | Technical / Urgent / Engineering | Technical / Urgent / Engineering | ✓ | ✓ | ✓ | no |
| 09-vague | Other / Medium / Client Success | Other / Medium / Client Success | ✓ | ✓ | ✓ | no |
| 10-repeat-billing | Billing / High / Finance | Billing / High / Finance | ✓ | ✓ | ✓ | no |
| 11-multi-intent | Technical / High / Engineering | Technical / High / Engineering | ✓ | ✓ | ✓ | no |
| 12-typos | Technical / Urgent / Engineering | Technical / Urgent / Engineering | ✓ | ✓ | ✓ | no |

## Interpretation

Exact category and owner matches are useful for a small prototype but are not a production accuracy claim. The critical-miss metric is intentionally stricter: any known Urgent request routed below High is treated as an operational failure. Labels are a single-person golden set and should be reviewed with real team annotations before launch.
