import { pgTable, text, integer, real, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  strategy: text("strategy").notNull(),
  model: text("model").notNull(),
  prompt_hash: text("prompt_hash").notNull(),
  status: text("status").notNull().default("pending"), // pending | running | completed | failed
  total_cases: integer("total_cases").notNull().default(0),
  completed_cases: integer("completed_cases").notNull().default(0),
  schema_failures: integer("schema_failures").notNull().default(0),
  hallucination_count: integer("hallucination_count").notNull().default(0),
  aggregate_scores: jsonb("aggregate_scores"),
  tokens_input: integer("tokens_input").notNull().default(0),
  tokens_output: integer("tokens_output").notNull().default(0),
  tokens_cache_read: integer("tokens_cache_read").notNull().default(0),
  tokens_cache_write: integer("tokens_cache_write").notNull().default(0),
  cost_usd: real("cost_usd").notNull().default(0),
  wall_ms: integer("wall_ms").notNull().default(0),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const caseResults = pgTable(
  "case_results",
  {
    id: text("id").primaryKey(),
    run_id: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    transcript_id: text("transcript_id").notNull(),
    attempt_count: integer("attempt_count").notNull().default(1),
    schema_valid: boolean("schema_valid").notNull().default(false),
    prediction: jsonb("prediction"),
    scores: jsonb("scores"),
    hallucinations: jsonb("hallucinations").notNull().default([]),
    attempts: jsonb("attempts").notNull().default([]),
    tokens_input: integer("tokens_input").notNull().default(0),
    tokens_output: integer("tokens_output").notNull().default(0),
    tokens_cache_read: integer("tokens_cache_read").notNull().default(0),
    tokens_cache_write: integer("tokens_cache_write").notNull().default(0),
    cost_usd: real("cost_usd").notNull().default(0),
    wall_ms: integer("wall_ms").notNull().default(0),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("case_results_run_id_idx").on(t.run_id),
    index("case_results_transcript_run_idx").on(t.transcript_id, t.run_id),
  ]
);

export const runsRelations = relations(runs, ({ many }) => ({
  cases: many(caseResults),
}));

export const caseResultsRelations = relations(caseResults, ({ one }) => ({
  run: one(runs, { fields: [caseResults.run_id], references: [runs.id] }),
}));
