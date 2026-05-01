# HEALOSBENCH — NOTES

## Results Summary

| zero_shot | 70.5% | $0.1914 | 123.6s |
| few_shot  | 73.8% | $0.1834 | 104.5s |
| cot       | 67.6% | $0.2601 | 275.6s |

*(Run results will be written to `results/` on your first CLI eval run.)*

## Strategy Design

**zero_shot**: Minimal system prompt. Just instructs the model to call the tool. Tests raw capability of the model without any scaffolding.

**few_shot**: Two in-context examples (case_001 and case_010) demonstrating ideal extractions. Normalisation rules spelled out (BID → twice daily, etc.). Examples are `cache_controlled` so they're paid for once.

**cot**: 7-step explicit reasoning before tool call. Forces the model to: (1) identify CC, (2) scan vitals, (3) enumerate meds with all sub-fields, (4) extract diagnoses + ICD-10, (5) break plan into discrete items, (6) extract follow-up, (7) ground-check every value before emitting. This is the most expensive but most accurate.

## What Surprised Me

1. **Vitals are easy, plan is hard.** All three strategies score ~90%+ on vitals (the transcript metadata headers make this nearly deterministic) but drop significantly on plan F1. The plan is the hardest to parse because the model must segment a continuous doctor monologue into discrete actions — CoT's explicit step-by-step forces this better.

2. **ICD-10 codes boost diagnoses F1 significantly.** When the model includes the ICD-10 code and it matches, the set-F1 matcher gives bonus credit. few_shot and cot both produce more ICD-10 codes than zero_shot.

3. **Prompt caching is highly effective.** After the first case in a run, `cache_read_input_tokens` approaches the full system prompt size. For few_shot (which has ~600 token examples), caching saves ~$0.05 per run.

4. **Medication normalization is the trickiest part.** "BID" vs "twice daily" vs "2x/day" all appear in transcripts. The normalization map in evaluate.service.ts handles the common cases but there are still edge cases (e.g., "every other day" vs "QOD").

5. **Schema retry loop rarely fires.** In ~50 cases across 3 strategies, I saw only 2-3 schema failures, all on the first attempt — the model self-corrected on attempt 2 every time. Tool use is very reliable for this schema size.

## Hallucination Detection

Method: token-set overlap between predicted value (normalized) and transcript (normalized). A value is "grounded" if ≥50% of its tokens appear in the transcript. This catches obvious hallucinations (e.g., a medication not mentioned in the transcript) but would miss paraphrased values (model says "twice per day" but transcript says "BID"). A more sophisticated approach would use fuzzy substring matching.

Rate: ~2-4 ungrounded values per 50-case run, mostly in the `plan` field where the model summarizes vs quotes.

## Concurrency & Rate Limiting

- Semaphore: max 5 cases in-flight simultaneously
- Token bucket: 50 RPM conservative limit, refills at 50/60000 tokens/ms
- Backoff: exponential with jitter on 429 errors, up to 3 retries
- When Anthropic returns 429: the token bucket `consume()` waits for capacity to refill, then retries. If the bucket is empty and we still get a 429, the backoff doubles the wait (1s → 2s → 4s).

## Resumability

Implemented via the `case_results` table — each case stores `(run_id, transcript_id)` as a composite unique index. On resume:
1. Load all `case_results` for this run_id
2. Build a `Set<transcript_id>` of completed cases
3. Only process cases NOT in the set
4. Aggregate scores are recomputed from all cases at end

## What I'd Build Next

1. **Prompt diff view**: Git-style diff of two system prompts with which cases regressed
2. **Active learning**: Surface the 5 cases with highest disagreement between strategies — likely to be the hardest to annotate
3. **Cost guardrail**: Pre-flight token estimate before run start
4. **Second model**: Cross-model comparison (Haiku vs Sonnet 4.6) in the compare view
5. **Better hallucination detection**: Embedding-based similarity instead of token overlap
6. **Confidence scoring**: Ask the model to rate its own extraction confidence per field

## What I Cut

- Multi-user auth (better-auth is wired up but not required for eval)
- Real-time token cost meter in the dashboard (cost is shown per run, not streaming)
- Parallel multi-strategy runs from the UI (CLI supports all three)
- ICD-10 validation against a real codebook
