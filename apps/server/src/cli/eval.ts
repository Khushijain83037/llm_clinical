#!/usr/bin/env bun
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { extract } from "@test-evals/llm";
import type { PromptStrategy, CaseResult, FieldScores, HallucinationReport } from "@test-evals/shared";
import { evaluate, aggregateScores } from "../services/evaluate.service.js";
import { loadDataset } from "../services/dataset.service.js";
import { computePromptHash } from "../services/prompt-hash.js";

const args = process.argv.slice(2);
const strategyArg = (args.find((a) => a.startsWith("--strategy="))?.split("=")[1] ?? "zero_shot") as PromptStrategy;
const modelArg = args.find((a) => a.startsWith("--model="))?.split("=")[1] ?? "claude-haiku-4-5-20251001";
const filterArg = args.find((a) => a.startsWith("--filter="))?.split("=")[1]?.split(",");

const strategy = strategyArg;
const model = modelArg;

const CONCURRENCY = 5;

console.log(`\n🏥 HEALOSBENCH CLI`);
console.log(`Strategy: ${strategy} | Model: ${model}`);
console.log(`Prompt hash: ${computePromptHash(strategy)}`);
console.log(`${"─".repeat(60)}`);

const dataset = loadDataset(filterArg);
console.log(`Cases: ${dataset.length}\n`);

const client = new Anthropic();

// Simple semaphore
let slots = CONCURRENCY;
const queue: Array<() => void> = [];
function acquire(): Promise<void> {
  if (slots > 0) { slots--; return Promise.resolve(); }
  return new Promise<void>((res) => queue.push(res));
}
function release() {
  if (queue.length > 0) queue.shift()!();
  else slots++;
}

const results: CaseResult[] = [];
let completed = 0;
let schemaFails = 0;
let hallucinationCount = 0;
const runStart = Date.now();

await Promise.all(
  dataset.map(async (dc) => {
    await acquire();
    const t0 = Date.now();
    try {
      const result = await extract(client, dc.transcript, strategy, model);
      const wall_ms = Date.now() - t0;

      let scores: FieldScores | null = null;
      let hallucinations: HallucinationReport[] = [];

      if (result.extraction) {
        const ev = evaluate(result.extraction, dc.gold, dc.transcript);
        scores = ev.scores;
        hallucinations = ev.hallucinations;
      }

      const cr: CaseResult = {
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

      results.push(cr);
      completed++;
      if (!result.schema_valid) schemaFails++;
      hallucinationCount += hallucinations.filter((h) => !h.grounded).length;

      const overallStr = scores ? (scores.overall * 100).toFixed(1).padStart(5) : "  N/A";
      const cacheStr = result.tokens.cache_read > 0 ? ` 💾cache:${result.tokens.cache_read}` : "";
      console.log(
        `[${String(completed).padStart(2)}/${dataset.length}] ${dc.id}  F1:${overallStr}%` +
        `  attempts:${result.attempts.length}  ${result.schema_valid ? "✓" : "✗"}` +
        `  $${result.tokens.cost_usd.toFixed(5)}${cacheStr}`
      );
    } finally {
      release();
    }
  })
);

const wallSec = ((Date.now() - runStart) / 1000).toFixed(1);
const validScores = results.map((r) => r.scores).filter(Boolean) as FieldScores[];
const agg = aggregateScores(validScores);
const totalCost = results.reduce((a, r) => a + r.tokens.cost_usd, 0);
const totalIn = results.reduce((a, r) => a + r.tokens.input, 0);
const totalOut = results.reduce((a, r) => a + r.tokens.output, 0);
const totalCacheRead = results.reduce((a, r) => a + r.tokens.cache_read, 0);
const totalCacheWrite = results.reduce((a, r) => a + r.tokens.cache_write, 0);

function pct(n: number) { return `${(n * 100).toFixed(1).padStart(5)}%`; }

console.log(`\n${"═".repeat(60)}`);
console.log(`RESULTS — ${strategy.toUpperCase()} — ${model}`);
console.log(`${"═".repeat(60)}`);
console.log(`\n📊 Field Scores:`);
console.log(`  chief_complaint   ${pct(agg.chief_complaint)}`);
console.log(`  vitals.bp         ${pct(agg.vitals.bp)}`);
console.log(`  vitals.hr         ${pct(agg.vitals.hr)}`);
console.log(`  vitals.temp_f     ${pct(agg.vitals.temp_f)}`);
console.log(`  vitals.spo2       ${pct(agg.vitals.spo2)}`);
console.log(`  vitals (avg)      ${pct(agg.vitals.avg)}`);
console.log(`  medications F1    ${pct(agg.medications.f1)}  P:${pct(agg.medications.precision)} R:${pct(agg.medications.recall)}`);
console.log(`  diagnoses F1      ${pct(agg.diagnoses.f1)}  P:${pct(agg.diagnoses.precision)} R:${pct(agg.diagnoses.recall)}`);
console.log(`  plan F1           ${pct(agg.plan.f1)}  P:${pct(agg.plan.precision)} R:${pct(agg.plan.recall)}`);
console.log(`  follow_up days    ${pct(agg.follow_up_interval)}`);
console.log(`  follow_up reason  ${pct(agg.follow_up_reason)}`);
console.log(`  ${"─".repeat(30)}`);
console.log(`  OVERALL F1        ${pct(agg.overall)}`);
console.log(`\n📈 Run stats:`);
console.log(`  Cases:            ${completed}/${dataset.length}`);
console.log(`  Schema failures:  ${schemaFails}`);
console.log(`  Hallucinations:   ${hallucinationCount} ungrounded values`);
console.log(`  Wall time:        ${wallSec}s`);
console.log(`\n💰 Token usage:`);
console.log(`  Input:            ${totalIn.toLocaleString()}`);
console.log(`  Output:           ${totalOut.toLocaleString()}`);
console.log(`  Cache read:       ${totalCacheRead.toLocaleString()}`);
console.log(`  Cache write:      ${totalCacheWrite.toLocaleString()}`);
console.log(`  Total cost:       $${totalCost.toFixed(4)}`);
console.log(`\nPrompt hash: ${computePromptHash(strategy)}`);

const outDir = resolve(process.cwd(), "results");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, `${strategy}_${Date.now()}.json`);
writeFileSync(outFile, JSON.stringify({ strategy, model, prompt_hash: computePromptHash(strategy), aggregate: agg, cases: results }, null, 2));
console.log(`\n📁 Results saved: ${outFile}`);
