# HEALOSBENCH — Clinical Transcript Extraction Eval

## Results

| Strategy   | Overall F1 | Meds F1 | Dx F1 | Plan F1 | Cost    | Duration |
|------------|-----------|---------|-------|---------|---------|----------|
| few_shot   | **73.8%** | 66.5%   | 84.7% | 76.5%   | $0.1834 | 104.5s   |
| zero_shot  | 70.5%     | 65.6%   | 79.3% | 72.7%   | $0.1914 | 123.6s   |
| cot        | 67.6%     | 62.1%   | 79.4% | 68.7%   | $0.2601 | 275.6s   |

## Methodology

- **Model:** claude-haiku-4-5-20251001
- **Cases:** 50 synthetic doctor-patient transcripts
- **Scoring:** Per-field F1 with token-overlap for text fields, exact match for numerics
- **Retries:** Up to 3 attempts per case on schema validation failure

## Why few_shot wins

Few-shot provides concrete extraction examples directly in the prompt. For smaller models like Haiku, seeing examples is more effective than following abstract instructions (zero_shot) or reasoning step-by-step (CoT). CoT adds significant latency (275s vs 104s) without accuracy gains.

## Running locally

```bash
git clone https://github.com/Khushijain83037/llm_clinical
cd llm_clinical
bun install
cp apps/server/.env.example apps/server/.env  # add ANTHROPIC_API_KEY
bun run eval -- --strategy=zero_shot
bun run eval -- --strategy=few_shot
bun run eval -- --strategy=cot
```

## Live Demo

https://model.devchauhan.com

## Tech Stack

- Bun + Turborepo (monorepo)
- Hono (API server, port 8800)
- Next.js 16 (dashboard, port 8801)
- PostgreSQL + Drizzle ORM
- Anthropic SDK (claude-haiku-4-5-20251001)
