import type { PipelineConfig } from '../types';

/**
 * Creates a stable JSON fingerprint of the pipeline config fields that, if
 * changed, would make resuming an interrupted run unsafe or misleading.
 * Used to warn the user when the config has changed since the interruption.
 */
export function buildPipelineFingerprint(config: PipelineConfig): string {
  return JSON.stringify({
    stages: config.stages
      .filter((s) => s.enabled)
      .map((s) => ({
        provider: s.provider,
        model: s.model,
        ...(s.provider === 'deepl' ? { deepl: s.providerOptions?.deepl } : { prompt: s.prompt }),
      })),
    judge: { provider: config.judgeProvider, model: config.judgeModel, prompt: config.judgePrompt },
    ...(config.workBrief?.trim() ? { workBrief: config.workBrief.trim() } : {}),
  });
}
