import type {
  ClinicalExtraction,
  FieldScores,
  HallucinationReport,
  SetF1Scores,
  VitalScores,
} from "@test-evals/shared";

// ── Fuzzy string matching ─────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function tokenSet(a: string): Set<string> {
  return new Set(normalize(a).split(" ").filter(Boolean));
}

export function fuzzyScore(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let intersection = 0;
  for (const t of sa) if (sb.has(t)) intersection++;
  const union = new Set([...sa, ...sb]).size;
  return intersection / union;  // Jaccard similarity
}

// Check if val appears in transcript (grounding check)
export function isGrounded(val: string, transcript: string): boolean {
  const norm = normalize(val);
  const normT = normalize(transcript);
  if (normT.includes(norm)) return true;
  // fuzzy: if at least half the tokens appear in transcript
  const tokens = norm.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  const transcriptTokens = new Set(normT.split(" ").filter(Boolean));
  const found = tokens.filter((t) => transcriptTokens.has(t)).length;
  return found / tokens.length >= 0.5;
}

// ── Medication normalization ──────────────────────────────────────────────────

const FREQ_MAP: Record<string, string> = {
  qd: "once daily", "once a day": "once daily", "1x daily": "once daily",
  bid: "twice daily", "twice a day": "twice daily", "2x daily": "twice daily", "two times daily": "twice daily",
  tid: "three times daily", "three times a day": "three times daily",
  qid: "four times daily", "four times a day": "four times daily",
  qhs: "at bedtime", "at night": "at bedtime",
  prn: "as needed", "when needed": "as needed",
};

function normalizeFreq(f: string | null): string {
  if (!f) return "";
  const n = normalize(f);
  return FREQ_MAP[n] ?? n;
}

function normalizeDose(d: string | null): string {
  if (!d) return "";
  return normalize(d).replace(/\s/g, "");
}

interface NormMed {
  name: string;
  dose: string;
  freq: string;
}

function normMed(m: ClinicalExtraction["medications"][0]): NormMed {
  return {
    name: normalize(m.name),
    dose: normalizeDose(m.dose),
    freq: normalizeFreq(m.frequency),
  };
}

function medsMatch(a: NormMed, b: NormMed): boolean {
  const nameScore = fuzzyScore(a.name, b.name);
  if (nameScore < 0.5) return false;
  const doseMatch = !a.dose || !b.dose || a.dose === b.dose;
  const freqMatch = !a.freq || !b.freq || a.freq === b.freq || fuzzyScore(a.freq, b.freq) >= 0.6;
  return doseMatch && freqMatch;
}

// ── Set F1 ────────────────────────────────────────────────────────────────────

function setF1<T>(
  preds: T[],
  golds: T[],
  matchFn: (a: T, b: T) => boolean
): SetF1Scores {
  if (preds.length === 0 && golds.length === 0) return { precision: 1, recall: 1, f1: 1 };
  if (preds.length === 0) return { precision: 0, recall: 0, f1: 0 };
  if (golds.length === 0) return { precision: 0, recall: 0, f1: 0 };

  const goldUsed = new Array(golds.length).fill(false);
  let tp = 0;

  for (const p of preds) {
    for (let i = 0; i < golds.length; i++) {
      if (!goldUsed[i] && matchFn(p, golds[i])) {
        tp++;
        goldUsed[i] = true;
        break;
      }
    }
  }

  const precision = tp / preds.length;
  const recall = tp / golds.length;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1 };
}

// ── Vitals scoring ────────────────────────────────────────────────────────────

function vitalScore(pred: string | number | null, gold: string | number | null, tolerance = 0): number {
  if (pred === null && gold === null) return 1;
  if (pred === null || gold === null) return 0;
  if (typeof pred === "string" && typeof gold === "string") return pred === gold ? 1 : 0;
  if (typeof pred === "number" && typeof gold === "number") {
    return Math.abs(pred - gold) <= tolerance ? 1 : 0;
  }
  return 0;
}

// ── Main evaluate function ────────────────────────────────────────────────────

export function evaluate(
  prediction: ClinicalExtraction,
  gold: ClinicalExtraction,
  transcript: string
): { scores: FieldScores; hallucinations: HallucinationReport[] } {
  // chief_complaint
  const chief_complaint = fuzzyScore(prediction.chief_complaint, gold.chief_complaint);

  // vitals
  const bp = vitalScore(prediction.vitals.bp, gold.vitals.bp);
  const hr = vitalScore(prediction.vitals.hr, gold.vitals.hr, 2); // ±2 bpm tolerance
  const temp_f = vitalScore(prediction.vitals.temp_f, gold.vitals.temp_f, 0.2); // ±0.2°F
  const spo2 = vitalScore(prediction.vitals.spo2, gold.vitals.spo2, 1); // ±1%
  const vitalAvg = (bp + hr + temp_f + spo2) / 4;
  const vitals: VitalScores = { bp, hr, temp_f, spo2, avg: vitalAvg };

  // medications
  const medications = setF1(
    prediction.medications.map(normMed),
    gold.medications.map(normMed),
    medsMatch
  );

  // diagnoses
  const diagnoses = setF1(
    prediction.diagnoses,
    gold.diagnoses,
    (a, b) => {
      const descScore = fuzzyScore(a.description, b.description);
      if (descScore >= 0.5) return true;
      if (a.icd10 && b.icd10 && a.icd10 === b.icd10) return true;
      return false;
    }
  );

  // plan
  const plan = setF1(
    prediction.plan,
    gold.plan,
    (a, b) => fuzzyScore(a, b) >= 0.4
  );

  // follow_up
  const fu_pred = prediction.follow_up;
  const fu_gold = gold.follow_up;
  const follow_up_interval = vitalScore(fu_pred.interval_days, fu_gold.interval_days);
  const follow_up_reason = fuzzyScore(fu_pred.reason, fu_gold.reason);

  // overall weighted score
  const overall = (
    chief_complaint * 0.15 +
    vitalAvg * 0.15 +
    medications.f1 * 0.2 +
    diagnoses.f1 * 0.2 +
    plan.f1 * 0.2 +
    follow_up_interval * 0.05 +
    follow_up_reason * 0.05
  );

  const scores: FieldScores = {
    chief_complaint,
    vitals,
    medications,
    diagnoses,
    plan,
    follow_up_interval,
    follow_up_reason,
    overall,
  };

  // Hallucination detection
  const hallucinations: HallucinationReport[] = [];

  const checkGrounding = (field: string, val: string) => {
    const grounded = isGrounded(val, transcript);
    hallucinations.push({ field, value: val, grounded });
  };

  checkGrounding("chief_complaint", prediction.chief_complaint);

  for (const med of prediction.medications) {
    checkGrounding(`medications.name`, med.name);
    if (med.dose) checkGrounding(`medications.dose`, med.dose);
  }

  for (const dx of prediction.diagnoses) {
    checkGrounding(`diagnoses.description`, dx.description);
  }

  for (const item of prediction.plan) {
    checkGrounding(`plan`, item);
  }

  return { scores, hallucinations };
}

export function aggregateScores(results: FieldScores[]): FieldScores {
  const n = results.length;
  if (n === 0) {
    return {
      chief_complaint: 0,
      vitals: { bp: 0, hr: 0, temp_f: 0, spo2: 0, avg: 0 },
      medications: { precision: 0, recall: 0, f1: 0 },
      diagnoses: { precision: 0, recall: 0, f1: 0 },
      plan: { precision: 0, recall: 0, f1: 0 },
      follow_up_interval: 0,
      follow_up_reason: 0,
      overall: 0,
    };
  }

  const sum = (key: (r: FieldScores) => number) => results.reduce((a, r) => a + key(r), 0) / n;

  return {
    chief_complaint: sum((r) => r.chief_complaint),
    vitals: {
      bp: sum((r) => r.vitals.bp),
      hr: sum((r) => r.vitals.hr),
      temp_f: sum((r) => r.vitals.temp_f),
      spo2: sum((r) => r.vitals.spo2),
      avg: sum((r) => r.vitals.avg),
    },
    medications: {
      precision: sum((r) => r.medications.precision),
      recall: sum((r) => r.medications.recall),
      f1: sum((r) => r.medications.f1),
    },
    diagnoses: {
      precision: sum((r) => r.diagnoses.precision),
      recall: sum((r) => r.diagnoses.recall),
      f1: sum((r) => r.diagnoses.f1),
    },
    plan: {
      precision: sum((r) => r.plan.precision),
      recall: sum((r) => r.plan.recall),
      f1: sum((r) => r.plan.f1),
    },
    follow_up_interval: sum((r) => r.follow_up_interval),
    follow_up_reason: sum((r) => r.follow_up_reason),
    overall: sum((r) => r.overall),
  };
}
