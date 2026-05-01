import Anthropic from "@anthropic-ai/sdk";
import {
  ClinicalExtractionSchema,
  type ClinicalExtraction,
  type PromptStrategy,
  type AttemptLog,
  type TokenUsage,
} from "@test-evals/shared";
import { EXTRACTION_TOOL } from "./tool-def.js";
import * as zero_shot from "./strategies/zero_shot.js";
import * as few_shot from "./strategies/few_shot.js";
import * as cot from "./strategies/cot.js";

const MAX_ATTEMPTS = 3;

// Haiku 4.5 pricing per million tokens
const INPUT_COST_PER_M = 0.80;
const OUTPUT_COST_PER_M = 4.00;
const CACHE_WRITE_COST_PER_M = 1.00;
const CACHE_READ_COST_PER_M = 0.08;

export interface ExtractionResult {
  extraction: ClinicalExtraction | null;
  attempts: AttemptLog[];
  tokens: TokenUsage;
  schema_valid: boolean;
}

function getStrategy(strategy: PromptStrategy) {
  switch (strategy) {
    case "zero_shot": return zero_shot;
    case "few_shot": return few_shot;
    case "cot": return cot;
  }
}

function calcCost(usage: TokenUsage): number {
  return (
    (usage.input / 1_000_000) * INPUT_COST_PER_M +
    (usage.output / 1_000_000) * OUTPUT_COST_PER_M +
    (usage.cache_write / 1_000_000) * CACHE_WRITE_COST_PER_M +
    (usage.cache_read / 1_000_000) * CACHE_READ_COST_PER_M
  );
}

export async function extract(
  client: Anthropic,
  transcript: string,
  strategy: PromptStrategy,
  model: string
): Promise<ExtractionResult> {
  const strat = getStrategy(strategy);
  const sysPrompt = strat.systemPrompt();

  const attempts: AttemptLog[] = [];
  const tokens: TokenUsage = { input: 0, output: 0, cache_read: 0, cache_write: 0, cost_usd: 0 };

  // Build initial messages
  type MessageParam = Anthropic.MessageParam;
  const messages: MessageParam[] = [
    { role: "user", content: strat.userMessage(transcript) }
  ];

  let extraction: ClinicalExtraction | null = null;
  let schema_valid = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const requestMessages = JSON.parse(JSON.stringify(messages)) as MessageParam[];

    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: sysPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "auto" },
      messages,
    });

    // Accumulate token usage
    const u = response.usage as Anthropic.Usage & {
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    tokens.input += u.input_tokens ?? 0;
    tokens.output += u.output_tokens ?? 0;
    tokens.cache_read += u.cache_read_input_tokens ?? 0;
    tokens.cache_write += u.cache_creation_input_tokens ?? 0;

    // Extract tool use block
    const toolBlock = response.content.find((b) => b.type === "tool_use");
    const textBlocks = response.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("\n");

    let validationErrors: string[] = [];
    let rawInput: unknown = null;

    if (toolBlock && toolBlock.type === "tool_use") {
      rawInput = toolBlock.input;
      const parsed = ClinicalExtractionSchema.safeParse(rawInput);

      if (parsed.success) {
        extraction = parsed.data;
        schema_valid = true;

        attempts.push({
          attempt,
          request_messages: requestMessages,
          response_text: textBlocks,
          validation_errors: [],
          success: true,
        });
        break;
      } else {
        validationErrors = parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
      }
    } else {
      validationErrors = ["No tool_use block in response — model did not call extract_clinical_data"];
    }

    attempts.push({
      attempt,
      request_messages: requestMessages,
      response_text: textBlocks,
      validation_errors: validationErrors,
      success: false,
    });

    if (attempt < MAX_ATTEMPTS) {
      // Add assistant turn + user correction
      messages.push({ role: "assistant", content: response.content });
      // Must include tool_result for every tool_use block
      const toolUseBlock = response.content.find((b) => b.type === "tool_use");
      const toolResultContent = toolUseBlock
        ? [
            {
              type: "tool_result" as const,
              tool_use_id: (toolUseBlock as { id: string }).id,
              content: `Validation failed. Errors:\n${validationErrors.join("\n")}\n\nPlease fix and call extract_clinical_data again.`,
              is_error: true,
            },
          ]
        : [{ type: "text" as const, text: `Validation failed. Errors:\n${validationErrors.join("\n")}\n\nPlease call extract_clinical_data again with corrected data.` }];
      messages.push({ role: "user", content: toolResultContent });
    }
  }

  tokens.cost_usd = calcCost(tokens);

  return { extraction, attempts, tokens, schema_valid };
}
