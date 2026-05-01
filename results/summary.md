# Eval Results Summary

## Strategy Comparison

| Strategy   | Overall F1 | Meds F1 | Dx F1 | Plan F1 | Cost    | Duration |
|------------|-----------|---------|-------|---------|---------|----------|
| few_shot   | **73.8%** | 66.5%   | 84.7% | 76.5%   | $0.1834 | 104.5s   |
| zero_shot  | 70.5%     | 65.6%   | 79.3% | 72.7%   | $0.1914 | 123.6s   |
| cot        | 67.6%     | 62.1%   | 79.4% | 68.7%   | $0.2601 | 275.6s   |

## Per-Field Breakdown (few_shot — best overall)

| Field            | Score  |
|------------------|--------|
| Chief Complaint  | 48.6%  |
| Vitals (avg)     | 99.5%  |
| Medications F1   | 66.5%  |
| Diagnoses F1     | 84.7%  |
| Plan F1          | 76.5%  |
| Follow-up Days   | 84.0%  |
| Follow-up Reason | 36.2%  |

## Key Findings

- **few_shot wins** — example-based prompting outperforms instructions for smaller models like Haiku
- **CoT underperforms** — chain-of-thought adds latency (2.6x slower) without accuracy gains on Haiku
- **Vitals extraction near-perfect** (99.5%) — structured numeric data is easy
- **Chief complaint lowest** (~40%) — free-text semantic matching is hardest
- **Total cost: $0.63** for all 150 cases across 3 strategies
