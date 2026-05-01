import type { PromptStrategy } from "@test-evals/shared";

export const STRATEGY: PromptStrategy = "few_shot";

const EXAMPLE_1 = {
  transcript: `[Visit type: in-person sick visit]
[Vitals taken at intake: BP 122/78, HR 88, Temp 100.4, SpO2 98%]
Doctor: Hi Jenna, what brings you in today?
Patient: I've had a sore throat for about four days, and now my nose is completely stuffed up.
Doctor: Rapid strep is negative. This looks like a viral upper respiratory infection.
Doctor: Take ibuprofen 400 mg every 6 hours as needed. No need for a follow-up unless symptoms worsen.`,
  extraction: JSON.stringify({
    chief_complaint: "sore throat and nasal congestion for four days",
    vitals: { bp: "122/78", hr: 88, temp_f: 100.4, spo2: 98 },
    medications: [{ name: "ibuprofen", dose: "400 mg", frequency: "every 6 hours as needed", route: "PO" }],
    diagnoses: [{ description: "viral upper respiratory infection", icd10: "J06.9" }],
    plan: ["supportive care with fluids", "ibuprofen 400 mg every 6 hours as needed"],
    follow_up: { interval_days: null, reason: "return only if symptoms worsen" }
  }, null, 2)
};

const EXAMPLE_2 = {
  transcript: `[Visit type: follow-up]
[Vitals: BP 132/86, HR 78, Temp not taken, SpO2 not taken]
Doctor: How's your reflux been?
Patient: Much better since starting the omeprazole.
Doctor: Good. Continue omeprazole 20 mg once daily 30 minutes before breakfast. Follow up in 3 months to discuss tapering.`,
  extraction: JSON.stringify({
    chief_complaint: "GERD follow-up",
    vitals: { bp: "132/86", hr: 78, temp_f: null, spo2: null },
    medications: [{ name: "omeprazole", dose: "20 mg", frequency: "once daily", route: "PO" }],
    diagnoses: [{ description: "gastroesophageal reflux disease", icd10: "K21.9" }],
    plan: ["continue omeprazole 20 mg once daily 30 minutes before breakfast", "plan to taper in 8-12 weeks if controlled"],
    follow_up: { interval_days: 90, reason: "GERD recheck and discuss tapering" }
  }, null, 2)
};

export function systemPrompt(): string {
  return `You are a clinical documentation assistant. Extract structured information from doctor-patient transcripts.
You must call the extract_clinical_data tool with the extracted information.

Here are two examples of correct extractions:

EXAMPLE 1:
Transcript: ${EXAMPLE_1.transcript}
Correct extraction: ${EXAMPLE_1.extraction}

EXAMPLE 2:
Transcript: ${EXAMPLE_2.transcript}
Correct extraction: ${EXAMPLE_2.extraction}

Rules:
- Only include information explicitly stated in the transcript
- Use null for any value not mentioned
- Normalize medication frequencies: "BID" → "twice daily", "QD" → "once daily", etc.
- ICD-10 codes should only be included when clearly diagnosable from the transcript
- Do not hallucinate or infer values not present`;
}

export function userMessage(transcript: string): string {
  return `Now extract the structured clinical data from this new transcript:\n\n${transcript}`;
}
