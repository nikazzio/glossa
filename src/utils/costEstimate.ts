import type { PipelineConfig } from '../types';
import { MODEL_PRICING } from '../constants';

/** Approximate token count: ~1.35 tokens per word */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.35));
}

export interface StageCostEstimate {
  stageId: string;
  stageName: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null; // null = free (ollama) or unknown pricing
}

export interface PipelineCostEstimate {
  stages: StageCostEstimate[];
  judge: StageCostEstimate | null;
  totalUsd: number | null; // null if any stage has unknown pricing; 0 for fully free pipelines
  isFree: boolean; // true if all stages + judge are free (all ollama)
}

function stageEstimate(
  stageId: string,
  stageName: string,
  provider: string,
  model: string,
  inputDocTokens: number,
  promptTokens: number,
  outputDocTokens: number,
  outputRatio: number,
  pricingOverrides: Record<string, { input: number; output: number }>,
): StageCostEstimate {
  const inputTokens = inputDocTokens + promptTokens;
  const outputTokens = Math.ceil(outputDocTokens * outputRatio);
  const key = `${provider}/${model}`;
  const pricing = pricingOverrides[key] ?? MODEL_PRICING[key];
  const costUsd =
    provider === 'ollama' || !model
      ? null
      : pricing
        ? (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
        : null;
  return { stageId, stageName, provider, model, inputTokens, outputTokens, costUsd };
}

export function estimatePipelineCost(
  chunks: { originalText: string }[],
  config: PipelineConfig,
  pricingOverrides: Record<string, { input: number; output: number }> = {},
): PipelineCostEstimate {
  if (chunks.length === 0) {
    return { stages: [], judge: null, totalUsd: 0, isFree: false };
  }

  const totalWords = chunks.reduce(
    (sum, c) => sum + c.originalText.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const docTokens = Math.max(1, Math.ceil(totalWords * 1.35));

  const enabledStages = config.stages.filter((s) => s.enabled);

  const stageEstimates = enabledStages.map((stage) => {
    const promptTokens = estimateTokens(stage.prompt);
    return stageEstimate(
      stage.id,
      stage.name,
      stage.provider,
      stage.model,
      docTokens,
      promptTokens,
      docTokens,
      1.1,
      pricingOverrides,
    );
  });

  const judgeEstimate =
    config.judgeModel && config.judgeProvider
      ? stageEstimate(
          'judge',
          'Audit Guard',
          config.judgeProvider,
          config.judgeModel,
          docTokens * 2,
          estimateTokens(config.judgePrompt),
          docTokens,
          0.3,
          pricingOverrides,
        )
      : null;

  const allEstimates = judgeEstimate ? [...stageEstimates, judgeEstimate] : stageEstimates;

  const isFree = allEstimates.every((e) => e.provider === 'ollama');

  // If any non-free stage has null cost (unknown pricing), totalUsd is null
  const hasUnknown = allEstimates.some((e) => e.provider !== 'ollama' && e.costUsd === null);
  const totalUsd = isFree
    ? 0
    : hasUnknown
      ? null
      : allEstimates.reduce((sum, e) => sum + (e.costUsd ?? 0), 0);

  return { stages: stageEstimates, judge: judgeEstimate, totalUsd, isFree };
}
