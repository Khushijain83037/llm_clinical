import type Anthropic from "@anthropic-ai/sdk";

export const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "extract_clinical_data",
  description: "Extract structured clinical data from a doctor-patient transcript",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    required: ["chief_complaint", "vitals", "medications", "diagnoses", "plan", "follow_up"],
    properties: {
      chief_complaint: {
        type: "string",
        minLength: 1,
        description: "The patient's primary reason for the visit"
      },
      vitals: {
        type: "object",
        additionalProperties: false,
        required: ["bp", "hr", "temp_f", "spo2"],
        properties: {
          bp: { type: ["string", "null"], description: "Blood pressure as systolic/diastolic e.g. '128/82'" },
          hr: { type: ["integer", "null"], description: "Heart rate in bpm" },
          temp_f: { type: ["number", "null"], description: "Temperature in Fahrenheit" },
          spo2: { type: ["integer", "null"], description: "Oxygen saturation percent" }
        }
      },
      medications: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "dose", "frequency", "route"],
          properties: {
            name: { type: "string" },
            dose: { type: ["string", "null"] },
            frequency: { type: ["string", "null"] },
            route: { type: ["string", "null"] }
          }
        }
      },
      diagnoses: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["description"],
          properties: {
            description: { type: "string" },
            icd10: { type: "string" }
          }
        }
      },
      plan: {
        type: "array",
        items: { type: "string" }
      },
      follow_up: {
        type: "object",
        additionalProperties: false,
        required: ["interval_days", "reason"],
        properties: {
          interval_days: { type: ["integer", "null"] },
          reason: { type: ["string", "null"] }
        }
      }
    }
  }
};
