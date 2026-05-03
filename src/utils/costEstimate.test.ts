import { describe, it, expect } from 'vitest';
import { estimateTokens, estimatePipelineCost } from './costEstimate';
import type { PipelineConfig } from '../types';

const baseConfig: PipelineConfig = {
  sourceLanguage: 'English',
  targetLanguage: 'Italian',
  stages: [
    { id: 'stg-1', name: 'Draft', prompt: 'Translate literally.', model: 'gpt-4o-mini', provider: 'openai', enabled: true },
  ],
  judgePrompt: 'Audit the translation.',
  judgeModel: 'gpt-4o-mini',
  judgeProvider: 'openai',
  glossary: [],
};

describe('estimateTokens', () => {
  it('returns positive count for non-empty text', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0);
  });
  it('returns 1 for empty string', () => {
    expect(estimateTokens('')).toBe(1);
  });
});

describe('estimatePipelineCost', () => {
  it('returns zero cost for empty chunks', () => {
    const result = estimatePipelineCost([], baseConfig);
    expect(result.totalUsd).toBe(0);
  });

  it('returns a positive totalUsd for known-priced models', () => {
    const chunks = [{ originalText: 'The quick brown fox jumps over the lazy dog.' }];
    const result = estimatePipelineCost(chunks, baseConfig);
    expect(result.totalUsd).toBeGreaterThan(0);
  });

  it('marks isFree=true when all stages use ollama', () => {
    const ollamaConfig: PipelineConfig = {
      ...baseConfig,
      stages: [{ id: 's1', name: 'Draft', prompt: 'Translate.', model: 'llama3', provider: 'ollama', enabled: true }],
      judgeProvider: 'ollama',
      judgeModel: 'llama3',
    };
    const result = estimatePipelineCost([{ originalText: 'Hello world' }], ollamaConfig);
    expect(result.isFree).toBe(true);
    expect(result.totalUsd).toBe(0);
  });

  it('returns null totalUsd if any stage has unknown pricing', () => {
    const unknownConfig: PipelineConfig = {
      ...baseConfig,
      stages: [{ id: 's1', name: 'Draft', prompt: 'Translate.', model: 'unknown-model-xyz', provider: 'openai', enabled: true }],
      judgeProvider: 'openai',
      judgeModel: 'unknown-model-xyz',
    };
    const result = estimatePipelineCost([{ originalText: 'Hello world' }], unknownConfig);
    expect(result.totalUsd).toBeNull();
  });

  it('keeps judge output estimate based on the original document size', () => {
    const chunks = [{ originalText: 'one two three four five six seven eight nine ten' }];
    const docTokens = estimateTokens(chunks[0].originalText);
    const result = estimatePipelineCost(chunks, baseConfig);

    expect(result.judge?.inputTokens).toBe(docTokens * 2 + estimateTokens(baseConfig.judgePrompt));
    expect(result.judge?.outputTokens).toBe(Math.ceil(docTokens * 0.3));
  });
});
