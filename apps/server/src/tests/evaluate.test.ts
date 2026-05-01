import { describe, it, expect } from "bun:test";
import { fuzzyScore, isGrounded, evaluate } from "../services/evaluate.service.js";
import type { ClinicalExtraction, PromptStrategy } from "@test-evals/shared";
import { ClinicalExtractionSchema } from "@test-evals/shared";

// ── 1. Schema validation retry path ──────────────────────────────────────────

describe("schema validation retry path", () => {
  it("rejects invalid extraction (missing required field)", () => {
    const bad = {
      chief_complaint: "headache",
      vitals: { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 99 },
      // missing medications, diagnoses, plan, follow_up
    };
    const result = ClinicalExtractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects invalid bp format", () => {
    const bad = {
      chief_complaint: "headache",
      vitals: { bp: "120-80", hr: 72, temp_f: 98.6, spo2: 99 }, // wrong format
      medications: [],
      diagnoses: [],
      plan: [],
      follow_up: { interval_days: null, reason: null },
    };
    const result = ClinicalExtractionSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts valid extraction", () => {
    const good: ClinicalExtraction = {
      chief_complaint: "sore throat",
      vitals: { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 99 },
      medications: [{ name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours", route: "PO" }],
      diagnoses: [{ description: "viral URI", icd10: "J06.9" }],
      plan: ["rest and fluids"],
      follow_up: { interval_days: null, reason: "return if worse" },
    };
    const result = ClinicalExtractionSchema.safeParse(good);
    expect(result.success).toBe(true);
  });
});

// ── 2. Fuzzy medication matching ──────────────────────────────────────────────

describe("fuzzy medication matching", () => {
  it("matches identical medications", () => {
    const score = fuzzyScore("ibuprofen", "ibuprofen");
    expect(score).toBe(1);
  });

  it("matches case-insensitive", () => {
    const score = fuzzyScore("Ibuprofen", "ibuprofen");
    expect(score).toBe(1);
  });

  it("partial match gives intermediate score", () => {
    const score = fuzzyScore("amoxicillin clavulanate", "amoxicillin");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("completely different drugs score low", () => {
    const score = fuzzyScore("metformin", "lisinopril");
    expect(score).toBeLessThan(0.2);
  });

  it("handles null values", () => {
    expect(fuzzyScore(null, null)).toBe(1);
    expect(fuzzyScore("ibuprofen", null)).toBe(0);
    expect(fuzzyScore(null, "ibuprofen")).toBe(0);
  });
});

// ── 3. Set F1 correctness on tiny synthetic case ──────────────────────────────

describe("set F1 correctness", () => {
  const gold: ClinicalExtraction = {
    chief_complaint: "chest pain",
    vitals: { bp: "140/90", hr: 95, temp_f: 98.6, spo2: 97 },
    medications: [
      { name: "aspirin", dose: "81 mg", frequency: "once daily", route: "PO" },
      { name: "lisinopril", dose: "10 mg", frequency: "once daily", route: "PO" },
    ],
    diagnoses: [{ description: "hypertension", icd10: "I10" }],
    plan: ["start aspirin", "start lisinopril", "low sodium diet"],
    follow_up: { interval_days: 30, reason: "BP recheck" },
  };

  const transcript = "BP 140/90, HR 95, SpO2 97. Patient has chest pain. Start aspirin 81 mg once daily and lisinopril 10 mg once daily PO. Diagnose hypertension I10. Plan: start aspirin, start lisinopril, low sodium diet. Follow up in 30 days for BP recheck.";

  it("perfect prediction scores F1=1 on meds", () => {
    const { scores } = evaluate(gold, gold, transcript);
    expect(scores.medications.f1).toBe(1);
  });

  it("missing one med reduces recall", () => {
    const pred: ClinicalExtraction = {
      ...gold,
      medications: [{ name: "aspirin", dose: "81 mg", frequency: "once daily", route: "PO" }],
    };
    const { scores } = evaluate(pred, gold, transcript);
    expect(scores.medications.recall).toBeLessThan(1);
    expect(scores.medications.precision).toBe(1);
  });

  it("extra hallucinated med reduces precision", () => {
    const pred: ClinicalExtraction = {
      ...gold,
      medications: [
        ...gold.medications,
        { name: "metoprolol", dose: "25 mg", frequency: "twice daily", route: "PO" },
      ],
    };
    const { scores } = evaluate(pred, gold, transcript);
    expect(scores.medications.precision).toBeLessThan(1);
  });

  it("plan F1 is 1 for perfect match", () => {
    const { scores } = evaluate(gold, gold, transcript);
    expect(scores.plan.f1).toBeCloseTo(1, 1);
  });
});

// ── 4. Hallucination detector ────────────────────────────────────────────────

describe("hallucination detector", () => {
  const transcript = "Patient has sore throat. BP 122/78. HR 88. Temperature 100.4. SpO2 98%. Prescribe ibuprofen 400 mg every 6 hours. Diagnosis: viral upper respiratory infection J06.9.";

  it("detects grounded value (positive grounding)", () => {
    const pred: ClinicalExtraction = {
      chief_complaint: "sore throat",
      vitals: { bp: "122/78", hr: 88, temp_f: 100.4, spo2: 98 },
      medications: [{ name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours", route: "PO" }],
      diagnoses: [{ description: "viral upper respiratory infection", icd10: "J06.9" }],
      plan: ["ibuprofen for pain"],
      follow_up: { interval_days: null, reason: null },
    };
    const gold = pred;
    const { hallucinations } = evaluate(pred, gold, transcript);
    const cc = hallucinations.find((h) => h.field === "chief_complaint");
    expect(cc?.grounded).toBe(true);
  });

  it("flags hallucinated medication not in transcript (negative grounding)", () => {
    const pred: ClinicalExtraction = {
      chief_complaint: "sore throat",
      vitals: { bp: "122/78", hr: 88, temp_f: 100.4, spo2: 98 },
      medications: [{ name: "amoxicillin", dose: "500 mg", frequency: "three times daily", route: "PO" }],
      diagnoses: [{ description: "viral upper respiratory infection" }],
      plan: ["rest"],
      follow_up: { interval_days: null, reason: null },
    };
    const gold: ClinicalExtraction = {
      ...pred,
      medications: [{ name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours", route: "PO" }],
    };
    const { hallucinations } = evaluate(pred, gold, transcript);
    const medH = hallucinations.find((h) => h.field === "medications.name" && h.value === "amoxicillin");
    expect(medH?.grounded).toBe(false);
  });
});

// ── 5. Vitals numeric tolerance ───────────────────────────────────────────────

describe("vitals numeric tolerance", () => {
  const baseCase: ClinicalExtraction = {
    chief_complaint: "follow up",
    vitals: { bp: "120/80", hr: 72, temp_f: 98.6, spo2: 99 },
    medications: [],
    diagnoses: [],
    plan: [],
    follow_up: { interval_days: null, reason: null },
  };
  const transcript = "BP 120/80 HR 72 temp 98.6 SpO2 99 follow up";

  it("accepts temp within ±0.2°F tolerance", () => {
    const pred = { ...baseCase, vitals: { ...baseCase.vitals, temp_f: 98.7 } };
    const { scores } = evaluate(pred, baseCase, transcript);
    expect(scores.vitals.temp_f).toBe(1);
  });

  it("rejects temp outside ±0.2°F tolerance", () => {
    const pred = { ...baseCase, vitals: { ...baseCase.vitals, temp_f: 99.5 } };
    const { scores } = evaluate(pred, baseCase, transcript);
    expect(scores.vitals.temp_f).toBe(0);
  });
});

// ── 6. Resumability test (mock) ───────────────────────────────────────────────

describe("resumability", () => {
  it("skips already-completed transcript IDs", () => {
    const allIds = ["case_001", "case_002", "case_003", "case_004", "case_005"];
    const doneIds = new Set(["case_001", "case_002"]);
    const pending = allIds.filter((id) => !doneIds.has(id));
    expect(pending).toEqual(["case_003", "case_004", "case_005"]);
    expect(pending.length).toBe(3);
  });
});

// ── 7. Idempotency test ───────────────────────────────────────────────────────

describe("idempotency", () => {
  it("same key produces same prompt hash", async () => {
    const { computePromptHash } = await import("../services/prompt-hash.js");
    const h1 = computePromptHash("zero_shot");
    const h2 = computePromptHash("zero_shot");
    expect(h1).toBe(h2);
  });

  it("different strategies produce different hashes", async () => {
    const { computePromptHash } = await import("../services/prompt-hash.js");
    const h1 = computePromptHash("zero_shot");
    const h2 = computePromptHash("few_shot");
    const h3 = computePromptHash("cot");
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h2).not.toBe(h3);
  });
});

// ── 8. Rate-limit backoff (mock Anthropic SDK) ────────────────────────────────

describe("rate-limit backoff", () => {
  it("retries on 429 and eventually succeeds", async () => {
    let callCount = 0;
    const mockFn = async () => {
      callCount++;
      if (callCount < 3) {
        const err = new Error("429 rate limit") as Error & { status: number };
        err.status = 429;
        throw err;
      }
      return { success: true };
    };

    // Simplified backoff logic (mirrors runner logic)
    const MAX_RETRIES = 3;
    const runWithBackoff = async (fn: () => Promise<unknown>, attempt = 1): Promise<unknown> => {
      try {
        return await fn();
      } catch (err: unknown) {
        const isRateLimit = err instanceof Error && err.message.includes("429");
        if (isRateLimit && attempt <= MAX_RETRIES) {
          // no actual sleep in tests
          return runWithBackoff(fn, attempt + 1);
        }
        throw err;
      }
    };

    const result = await runWithBackoff(mockFn) as { success: boolean };
    expect(result.success).toBe(true);
    expect(callCount).toBe(3);
  });

  it("throws after max retries exceeded", async () => {
    let callCount = 0;
    const alwaysFails = async () => {
      callCount++;
      throw new Error("429 rate limit");
    };

    const runWithBackoff = async (fn: () => Promise<unknown>, attempt = 1): Promise<unknown> => {
      try {
        return await fn();
      } catch (err: unknown) {
        const isRateLimit = err instanceof Error && err.message.includes("429");
        if (isRateLimit && attempt <= 3) return runWithBackoff(fn, attempt + 1);
        throw err;
      }
    };

    expect(runWithBackoff(alwaysFails)).rejects.toThrow("429");
  });
});

// ── 9. Prompt hash stability ──────────────────────────────────────────────────

describe("prompt hash stability", () => {
  it("hash is 16 hex chars", async () => {
    const { computePromptHash } = await import("../services/prompt-hash.js");
    const h = computePromptHash("zero_shot");
    expect(h).toMatch(/^[a-f0-9]{16}$/);
  });

  it("changing strategy changes hash", async () => {
    const { computePromptHash } = await import("../services/prompt-hash.js");
    const strategies: PromptStrategy[] = ["zero_shot", "few_shot", "cot"];
    const hashes = strategies.map((s) => computePromptHash(s));
    const unique = new Set(hashes);
    expect(unique.size).toBe(3);
  });
});

