import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@test-evals/db";
import { runs, caseResults } from "../../../../packages/db/src/schema/index.js";
import { extract } from "@test-evals/llm";
import type { PromptStrategy, CaseResult, RunSummary, TokenUsage } from "@test-evals/shared";
import { evaluate, aggregateScores } from "./evaluate.service.js";
import { loadDataset } from "./dataset.service.js";
import { computePromptHash } from "./prompt-hash.js";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const CONCURRENCY = 5;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

// SSE subscribers per run
const subscribers = new Map<string, Set<(ev: string) => void>>();

export function subscribe(runId: string, cb: (ev: string) => void) {
  if (!subscribers.has(runId)) subscribers.set(runId, new Set());
  subscribers.get(runId)!.add(cb);
  return () => subscribers.get(runId)?.delete(cb);
}

function emit(runId: string, data: object) {
  const subs = subscribers.get(runId);
  if (!subs) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const cb of subs) cb(msg);
}

// Simple semaphore
class Semaphore {
  private slots: number;
  private queue: Array<() => void> = [];

  constructor(n: number) { this.slots = n; }

  async acquire(): Promise<void> {
    if (this.slots > 0) { this.slots--; return; }
    await new Promise<void>((res) => this.queue.push(res));
  }

  release() {
    if (this.queue.length > 0) {
      this.queue.shift()!();
    } else {
      this.slots++;
    }
  }
}

// Token-bucket rate limiter (requests per minute)
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly rate: number; // tokens per ms
  private readonly capacity: number;

  constructor(rpm: number) {
    this.capacity = rpm;
    this.tokens = rpm;
    this.rate = rpm / 60_000;
    this.lastRefill = Date.now();
  }

  async consume(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.rate);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitMs = (1 - this.tokens) / this.rate;
    await new Promise((res) => setTimeout(res, waitMs));
    this.tokens = 0;
    this.lastRefill = Date.now();
  }
}

const bucket = new TokenBucket(50); // 50 rpm conservative

async function runWithBackoff<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
  try {
    await bucket.consume();
    return await fn();
  } catch (err: unknown) {
    const isRateLimit =
      err instanceof Anthropic.RateLimitError ||
      (err instanceof Error && err.message.includes("429"));

    if (isRateLimit && attempt <= MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
      await new Promise((res) => setTimeout(res, delay));
      return runWithBackoff(fn, attempt + 1);
    }
    throw err;
  }
}

export async function startRun(opts: {
  strategy: PromptStrategy;
  model?: string;
  dataset_filter?: string[];
  force?: boolean;
}): Promise<string> {
  const model = opts.model ?? DEFAULT_MODEL;
  const strategy = opts.strategy;
  const prompt_hash = computePromptHash(strategy);

  const id = randomUUID();
  const dataset = loadDataset(opts.dataset_filter);

  await db.insert(runs).values({
    id,
    strategy,
    model,
    prompt_hash,
    status: "pending",
    total_cases: dataset.length,
    completed_cases: 0,
  });

  // Fire-and-forget
  executeRun(id, strategy, model, dataset, prompt_hash, opts.force ?? false).catch(
    async (err) => {
      console.error(`Run ${id} failed:`, err);
      await db.update(runs).set({ status: "failed" }).where(eq(runs.id, id));
    }
  );

  return id;
}

export async function resumeRun(runId: string): Promise<void> {
  const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status === "completed") return;

  const dataset = loadDataset();
  executeRun(runId, run.strategy as PromptStrategy, run.model, dataset, run.prompt_hash, false).catch(
    async (err) => {
      console.error(`Resume ${runId} failed:`, err);
      await db.update(runs).set({ status: "failed" }).where(eq(runs.id, runId));
    }
  );
}

async function executeRun(
  runId: string,
  strategy: PromptStrategy,
  model: string,
  dataset: { id: string; transcript: string; gold: import("@test-evals/shared").ClinicalExtraction }[],
  _prompt_hash: string,
  force: boolean
) {
  const client = new Anthropic();
  const sem = new Semaphore(CONCURRENCY);

  await db.update(runs).set({ status: "running" }).where(eq(runs.id, runId));

  // Load already-completed cases for this run
  const existing = await db.query.caseResults.findMany({ where: eq(caseResults.run_id, runId) });
  const doneIds = new Set(existing.map((c) => c.transcript_id));

  const pending = force ? dataset : dataset.filter((c) => !doneIds.has(c.id));

  let completed = doneIds.size;
  let schemaFailures = existing.filter((c) => !c.schema_valid).length;
  let hallucinationCount = existing.reduce((a, c) => {
    const h = (c.hallucinations as import("@test-evals/shared").HallucinationReport[]) ?? [];
    return a + h.filter((x) => !x.grounded).length;
  }, 0);

  const tokens: TokenUsage = existing.reduce(
    (acc, c) => ({
      input: acc.input + c.tokens_input,
      output: acc.output + c.tokens_output,
      cache_read: acc.cache_read + c.tokens_cache_read,
      cache_write: acc.cache_write + c.tokens_cache_write,
      cost_usd: acc.cost_usd + (c.cost_usd ?? 0),
    }),
    { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0 }
  );

  const runStart = Date.now();

  await Promise.all(
    pending.map(async (dc) => {
      await sem.acquire();
      const caseStart = Date.now();
      try {
        // Idempotency: check if already done (could have been added between query and here)
        const dup = await db.query.caseResults.findFirst({
          where: and(eq(caseResults.run_id, runId), eq(caseResults.transcript_id, dc.id)),
        });
        if (dup) {
          completed++;
          emit(runId, { type: "progress", run_id: runId, transcript_id: dc.id, completed, total: dataset.length });
          return;
        }

        const result = await runWithBackoff(() =>
          extract(client, dc.transcript, strategy, model)
        );

        const wall_ms = Date.now() - caseStart;

        let scores = null;
        let hallucinations: import("@test-evals/shared").HallucinationReport[] = [];

        if (result.extraction) {
          const ev = evaluate(result.extraction, dc.gold, dc.transcript);
          scores = ev.scores;
          hallucinations = ev.hallucinations;
        }

        const caseResult: CaseResult = {
          transcript_id: dc.id,
          attempt_count: result.attempts.length,
          schema_valid: result.schema_valid,
          prediction: result.extraction,
          scores,
          hallucinations,
          attempts: result.attempts,
          tokens: result.tokens,
          wall_ms,
        };

        await db.insert(caseResults).values({
          id: randomUUID(),
          run_id: runId,
          transcript_id: dc.id,
          attempt_count: result.attempts.length,
          schema_valid: result.schema_valid,
          prediction: result.extraction,
          scores,
          hallucinations,
          attempts: result.attempts,
          tokens_input: result.tokens.input,
          tokens_output: result.tokens.output,
          tokens_cache_read: result.tokens.cache_read,
          tokens_cache_write: result.tokens.cache_write,
          cost_usd: result.tokens.cost_usd,
          wall_ms,
        });

        completed++;
        if (!result.schema_valid) schemaFailures++;
        hallucinationCount += hallucinations.filter((h) => !h.grounded).length;
        tokens.input += result.tokens.input;
        tokens.output += result.tokens.output;
        tokens.cache_read += result.tokens.cache_read;
        tokens.cache_write += result.tokens.cache_write;
        tokens.cost_usd += result.tokens.cost_usd;

        await db.update(runs)
          .set({ completed_cases: completed, schema_failures: schemaFailures, hallucination_count: hallucinationCount })
          .where(eq(runs.id, runId));

        emit(runId, {
          type: "progress",
          run_id: runId,
          transcript_id: dc.id,
          completed,
          total: dataset.length,
          case_result: caseResult,
        });
      } finally {
        sem.release();
      }
    })
  );

  // Compute final aggregate scores from all case results
  const allCases = await db.query.caseResults.findMany({ where: eq(caseResults.run_id, runId) });
  const validScores = allCases
    .map((c) => c.scores)
    .filter(Boolean) as import("@test-evals/shared").FieldScores[];
  const aggregate_scores = aggregateScores(validScores);

  const wall_ms = Date.now() - runStart;

  await db.update(runs).set({
    status: "completed",
    completed_cases: dataset.length,
    schema_failures: schemaFailures,
    hallucination_count: hallucinationCount,
    aggregate_scores,
    tokens_input: tokens.input,
    tokens_output: tokens.output,
    tokens_cache_read: tokens.cache_read,
    tokens_cache_write: tokens.cache_write,
    cost_usd: tokens.cost_usd,
    wall_ms,
  }).where(eq(runs.id, runId));

  emit(runId, { type: "complete", run_id: runId, completed: dataset.length, total: dataset.length });
}

export async function getRuns(): Promise<RunSummary[]> {
  const rows = await db.query.runs.findMany({ orderBy: (r, { desc }) => [desc(r.created_at)] });
  return rows.map(toRunSummary);
}

export async function getRun(id: string) {
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, id),
    with: { cases: true },
  });
  return run;
}

function toRunSummary(row: typeof runs.$inferSelect): RunSummary {
  return {
    id: row.id,
    strategy: row.strategy as PromptStrategy,
    model: row.model,
    prompt_hash: row.prompt_hash,
    status: row.status as import("@test-evals/shared").RunStatus,
    total_cases: row.total_cases,
    completed_cases: row.completed_cases,
    schema_failures: row.schema_failures,
    hallucination_count: row.hallucination_count,
    aggregate_scores: row.aggregate_scores as import("@test-evals/shared").FieldScores | null,
    tokens: {
      input: row.tokens_input,
      output: row.tokens_output,
      cache_read: row.tokens_cache_read,
      cache_write: row.tokens_cache_write,
      cost_usd: row.cost_usd,
    },
    wall_ms: row.wall_ms,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
