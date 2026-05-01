import { z } from "zod";

// ── Schema types (mirrors data/schema.json) ──────────────────────────────────

export const MedicationSchema = z.object({
  name: z.string().min(1),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
  route: z.string().nullable(),
});

export const DiagnosisSchema = z.object({
  description: z.string().min(1),
  icd10: z.string().regex(/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/).optional(),
});

export const VitalsSchema = z.object({
  bp: z.string().regex(/^[0-9]{2,3}\/[0-9]{2,3}$/).nullable(),
  hr: z.number().int().min(20).max(250).nullable(),
  temp_f: z.number().min(90).max(110).nullable(),
  spo2: z.number().int().min(50).max(100).nullable(),
});

export const FollowUpSchema = z.object({
  interval_days: z.number().int().min(0).max(730).nullable(),
  reason: z.string().nullable(),
});

export const ClinicalExtractionSchema = z.object({
  chief_complaint: z.string().min(1),
  vitals: VitalsSchema,
  medications: z.array(MedicationSchema),
  diagnoses: z.array(DiagnosisSchema),
  plan: z.array(z.string().min(1)),
  follow_up: FollowUpSchema,
});

export type ClinicalExtraction = z.infer<typeof ClinicalExtractionSchema>;
export type Medication = z.infer<typeof MedicationSchema>;
export type Diagnosis = z.infer<typeof DiagnosisSchema>;
export type Vitals = z.infer<typeof VitalsSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;

// ── Strategy ─────────────────────────────────────────────────────────────────

export type PromptStrategy = "zero_shot" | "few_shot" | "cot";

// ── Per-field scores ──────────────────────────────────────────────────────────

export interface VitalScores {
  bp: number;   // 0 or 1
  hr: number;
  temp_f: number;
  spo2: number;
  avg: number;
}

export interface SetF1Scores {
  precision: number;
  recall: number;
  f1: number;
}

export interface FieldScores {
  chief_complaint: number;      // fuzzy [0,1]
  vitals: VitalScores;
  medications: SetF1Scores;
  diagnoses: SetF1Scores;
  plan: SetF1Scores;
  follow_up_interval: number;   // 0 or 1
  follow_up_reason: number;     // fuzzy [0,1]
  overall: number;              // weighted average
}

// ── Hallucination ─────────────────────────────────────────────────────────────

export interface HallucinationReport {
  field: string;
  value: string;
  grounded: boolean;
}

// ── Case result ───────────────────────────────────────────────────────────────

export interface CaseResult {
  transcript_id: string;
  attempt_count: number;
  schema_valid: boolean;
  prediction: ClinicalExtraction | null;
  scores: FieldScores | null;
  hallucinations: HallucinationReport[];
  attempts: AttemptLog[];
  tokens: TokenUsage;
  wall_ms: number;
}

export interface AttemptLog {
  attempt: number;
  request_messages: unknown[];
  response_text: string;
  validation_errors: string[];
  success: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  cost_usd: number;
}

// ── Run ───────────────────────────────────────────────────────────────────────

export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface RunSummary {
  id: string;
  strategy: PromptStrategy;
  model: string;
  prompt_hash: string;
  status: RunStatus;
  total_cases: number;
  completed_cases: number;
  schema_failures: number;
  hallucination_count: number;
  aggregate_scores: FieldScores | null;
  tokens: TokenUsage;
  wall_ms: number;
  created_at: string;
  updated_at: string;
}

export interface RunDetail extends RunSummary {
  cases: CaseResult[];
}

// ── SSE event ─────────────────────────────────────────────────────────────────

export interface ProgressEvent {
  type: "progress" | "complete" | "error";
  run_id: string;
  transcript_id?: string;
  completed: number;
  total: number;
  case_result?: CaseResult;
  error?: string;
}

// ── API DTOs ──────────────────────────────────────────────────────────────────

export interface StartRunRequest {
  strategy: PromptStrategy;
  model?: string;
  dataset_filter?: string[];
  force?: boolean;
}

export interface StartRunResponse {
  run_id: string;
  cached: boolean;
}
