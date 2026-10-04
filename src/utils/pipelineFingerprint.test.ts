import { describe, expect, it } from 'vitest';
import type { PipelineConfig } from '../types';
import { buildPipelineFingerprint } from './pipelineFingerprint';

function config(overrides: Omit<Partial<PipelineConfig>, 'pipelineId'> = {}): PipelineConfig {
  return {
    pipelineId: 'pipeline-1',
    sourceLanguage: 'Latin',
    targetLanguage: 'Italian',
    stages: [
      { id: 'stg-translation', name: 'Translation', role: 'translation', prompt: 'Translate.', model: 'gpt-5.4', provider: 'openai', enabled: true },
      { id: 'stg-refine', name: 'Refine', role: 'refine', prompt: 'Refine.', model: 'gpt-5.4', provider: 'openai', enabled: false },
    ],
    judgePrompt: 'Judge.',
    judgeModel: 'gpt-5.4-mini',
    judgeProvider: 'openai',
    glossary: [],
    ...overrides,
  };
}

describe('buildPipelineFingerprint', () => {
  it('changes when the prompt of an enabled stage changes', () => {
    const edited = config();
    const stages = edited.stages.map((stage) => stage.role === 'translation' ? { ...stage, prompt: 'Translate freely.' } : stage);
    expect(buildPipelineFingerprint({ ...edited, stages })).not.toBe(buildPipelineFingerprint(config()));
  });

  it('changes when the audit prompt changes', () => {
    expect(buildPipelineFingerprint(config({ judgePrompt: 'Judge strictly.' }))).not.toBe(buildPipelineFingerprint(config()));
  });

  it('changes when the work brief changes', () => {
    expect(buildPipelineFingerprint(config({ workBrief: 'Venetian, 17th century.' }))).not.toBe(buildPipelineFingerprint(config()));
  });

  it('ignores the prompt of a disabled stage', () => {
    const stages = config().stages.map((stage) => stage.role === 'refine' ? { ...stage, prompt: 'Other.' } : stage);
    expect(buildPipelineFingerprint(config({ stages }))).toBe(buildPipelineFingerprint(config()));
  });
});
