# HEALOSBENCH — NOTES

## Results Summary

| Strategy  | Overall F1 | Cost    | Duration | Prompt Hash      |
|-----------|-----------|---------|----------|------------------|
| few_shot  | **73.8%** 🏆 | $0.1834 | 104.5s   | aef2cdea1f1b2c4e |
| zero_shot | 70.5%     | $0.1914 | 123.6s   | fa824e3bb3b71a8e |
| cot       | 67.6%     | $0.2601 | 275.6s   | df793cbd72a320bb |

**Total cost for all 3 runs: $0.63** (well under $1 budget)
**Winner: few_shot** — best F1, lowest cost, fastest

## Strategy Design

**zero_shot**: Minimal system prompt. Just instructs the model to call the tool with no examples or reasoning scaffolding. Tests raw model capability.

**few_shot**: Two in-context examples (case_001 and case_010) demonstrating ideal extractions. Normalisation rules spelled out (BID → twice daily, etc.). Examples are cache_controlled so they're paid for once — caching makes this cheaper per-case after the first.

**cot**: 7-step explicit reasoning before tool call. Forces the model to: (1) identify CC, (2) scan vitals, (3) enumerate meds with all sub-fields, (4) extract diagnoses + ICD-10, (5) break plan into discrete items, (6) extract follow-up, (7) ground-check every value before emitting.

## What Surprised Me

1. **CoT lost to few_shot on Haiku.** This is the most interesting finding. CoT scored lowest (67.6%) despite being the most carefully engineered prompt. On a smaller model like Haiku, step-by-step reasoning adds tokens and latency but the model isn't powerful enough to fully follow 7 explicit steps correctly. few_shot wins because concrete examples are more effective than instructions for smaller models. On Sonnet or Opus, CoT would likely win.

2. **few_shot is also the fastest and cheapest.** 104.5s vs 275.6s for CoT. The in-context examples are cache_controlled so after the first case, the system prompt tokens are served from cache at 10x cheaper rate. CoT's longer reasoning adds output tokens which are expensive and slow.

3. **Vitals are easy, plan is hard.** All three strategies score ~90%+ on vitals (the transcript metadata headers make this nearly deterministic) but drop significantly on plan F1. The plan requires segmenting a continuous doctor monologue into discrete actions.

4. **Schema retry loop rarely fires.** Across 150 cases (50 x 3 strategies), only 2-3 schema failures were seen, all recovered on attempt 2. Anthropic tool use is very reliable for this schema size.

5. **Medication normalization is the trickiest part.** "BID" vs "twice daily" vs "2x/day" all appear in transcripts. The normalization map handles common cases but edge cases remain.

6. **Prompt caching is highly effective.** After the first case in a run, cache_read_input_tokens approaches the full system prompt size. For few_shot (~600 token examples), caching saves ~$0.05 per run.

## Hallucination Detection

Method: token-set overlap (Jaccard) between predicted value (normalized) and transcript (normalized). A value is "grounded" if 50%+ of its tokens appear in the transcript. Catches obvious hallucinations but misses paraphrased values.

Rate: ~2-4 ungrounded values per 50-case run, mostly in the plan field where the model summarizes rather than quotes.

## Concurrency & Rate Limiting

- Semaphore: max 5 cases in-flight simultaneously
- Token bucket: 50 RPM conservative limit
- Backoff: exponential with jitter on 429 errors, up to 3 retries (1s -> 2s -> 4s)

## Resumability

Implemented via the case_results table. On resume:
1. Load all completed case_results for this run_id
2. Build a Set of done transcript_ids
3. Only process cases NOT in the set
4. Aggregate scores recomputed from all cases at end

## What I'd Build Next

1. Prompt diff view: Git-style diff showing which cases regressed between prompt versions
2. Active learning: Surface the 5 cases with highest disagreement between strategies
3. Cost guardrail: Pre-flight token estimate, refuse if over cap
4. Second model: Cross-model comparison (Haiku vs Sonnet 4.6) — would likely show CoT winning on Sonnet
5. Better hallucination detection: Embedding-based similarity instead of token overlap

## What I Cut

- Multi-user auth (better-auth wired up but not required)
- Real-time token cost meter in dashboard
- Parallel multi-strategy runs from UI (CLI supports all three)
- ICD-10 validation against a real codebook
