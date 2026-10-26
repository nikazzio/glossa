import { DEFAULT_DEEPL_STAGE_OPTIONS } from '../constants';
import type { PipelineStageConfig } from '../types';

export function getDeeplOptions(stage: PipelineStageConfig) {
  return { ...DEFAULT_DEEPL_STAGE_OPTIONS, ...stage.providerOptions?.deepl };
}

export function resolveDeeplLanguages(stage: PipelineStageConfig) {
  const options = getDeeplOptions(stage);
  return {
    sourceLang: options.sourceLang.trim().toUpperCase(),
    targetLang: options.targetLang.trim().toUpperCase(),
  };
}
