import { createHash } from "crypto";
import * as zero_shot from "@test-evals/llm/strategies/zero_shot";
import * as few_shot from "@test-evals/llm/strategies/few_shot";
import * as cot from "@test-evals/llm/strategies/cot";
import type { PromptStrategy } from "@test-evals/shared";

function getPromptContent(strategy: PromptStrategy): string {
  switch (strategy) {
    case "zero_shot": return zero_shot.systemPrompt();
    case "few_shot": return few_shot.systemPrompt();
    case "cot": return cot.systemPrompt();
  }
}

export function computePromptHash(strategy: PromptStrategy): string {
  const content = getPromptContent(strategy);
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
