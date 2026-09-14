# Prompt design

## Version

The current pipeline records `analyze@v1+compose@v1` in every result. Prompt text is in `server/src/prompts.ts` so it is versioned with the implementation and easy to inspect in the Under the hood panel.

## Analyze prompt contract

The analysis prompt establishes the assistant role, the five allowed categories, four priority levels, four owners, the priority anchors, the category/owner distinction, exact entity extraction, confidence calibration, and JSON-only output. It explicitly says that `<request>` content is untrusted data and never an instruction. This is important for the stress case that appends “ignore previous instructions.”

The policy does not depend on the model seeing every safety phrase: it independently matches high-risk text as a second boundary. The prompt therefore improves judgment and language quality, but is not the only safety mechanism.

## Compose prompt contract

The compose prompt receives the already-final category, priority, owner, SLA, client tone, risk signals, and policy directives. It must acknowledge, restate, explain the next action and timing, ask for missing information, and sign off. It prohibits invented price, contract term, names, ticket numbers, completed actions, delivery dates, liability admissions, and promises beyond the supplied SLA. Missing human decisions use square brackets.

## Temperature and output handling

Analysis uses temperature 0.1 for stable labels. Composition uses 0.35 for modestly natural wording. Ollama requests JSON format; Gemini requests JSON MIME output. Both providers pass the response through the same extraction, repair, and Zod validation path, retry once with the validation issue, then fail to the rules provider at the orchestration boundary.

## Prompt iteration plan

1. Run `npm run eval` with the deterministic baseline.
2. Run with Ollama using `EVAL_PROVIDER=ollama LLM_PROVIDER=ollama`.
3. Inspect only misclassified cases and change one instruction at a time.
4. Bump `PROMPT_VERSION`, rerun all 12 cases, and record the difference.
5. Never add the exact six mock requests as few-shot examples; otherwise a demo could measure memorization rather than generalization.

## What should improve next

A production prompt should include account tier, open-ticket history, supported channels, and human-reviewed examples from actual operations. It should also support multilingual requests and explicit uncertainty. Those are intentionally outside this synthetic-data prototype.
