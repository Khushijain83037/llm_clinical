# HEALOSBENCH

Eval harness for LLM-powered clinical transcript extraction.

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Configure environment
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env with your DATABASE_URL and ANTHROPIC_API_KEY

# 3. Push DB schema
bun run db:push

# 4. Run eval (CLI, no DB required for this)
bun run eval -- --strategy=zero_shot
bun run eval -- --strategy=few_shot
bun run eval -- --strategy=cot

# 5. Start full dev stack (web + server)
bun run dev
```

## CLI Options

```bash
bun run eval -- --strategy=zero_shot
bun run eval -- --strategy=few_shot --model=claude-haiku-4-5-20251001
bun run eval -- --strategy=cot --filter=case_001,case_002,case_003
```

## Run Tests

```bash
bun test apps/server/src/tests/evaluate.test.ts
```

## Architecture

```
packages/
  shared/    — TypeScript types shared between server and web
  llm/       — Anthropic SDK wrapper: extractor, 3 strategies, tool def
  db/        — Drizzle ORM schema (runs + case_results tables)
  env/       — Typed env loading (zod)
apps/
  server/    — Hono API: runner, evaluator, dataset loader, SSE
  web/       — Next.js dashboard: runs list, run detail, compare view
data/
  transcripts/   — 50 synthetic clinical transcripts
  gold/          — Ground truth JSON extractions
  schema.json    — JSON Schema for ClinicalExtraction
results/           — CLI output (created on first run)
NOTES.md           — Results table, methodology, observations
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/runs` | Start a new eval run |
| GET | `/api/v1/runs` | List all runs |
| GET | `/api/v1/runs/:id` | Run detail with all cases |
| POST | `/api/v1/runs/:id/resume` | Resume interrupted run |
| GET | `/api/v1/runs/:id/stream` | SSE progress stream |
| GET | `/api/v1/runs/:runId/cases/:transcriptId` | Case detail |
| GET | `/api/v1/compare?a=:id&b=:id` | Compare two runs |
