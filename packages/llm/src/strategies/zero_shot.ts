import type { PromptStrategy } from "@test-evals/shared";

export const STRATEGY: PromptStrategy = "zero_shot";

export function systemPrompt(): string {
  return `You are a clinical documentation assistant. Extract structured information from doctor-patient transcripts.
You must call the extract_clinical_data tool with the extracted information. Be precise and only include information explicitly stated in the transcript.
If a value is not mentioned, use null. Do not hallucinate or infer values not present in the transcript.`;
}

export function userMessage(transcript: string): string {
  return `Extract the structured clinical data from this transcript:\n\n${transcript}`;
}
