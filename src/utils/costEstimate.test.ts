import { describe, it, expect } from 'vitest';
import { estimateTokens, estimatePipelineCost } from './costEstimate';
import type { PipelineConfig } from '../types';

const baseConfig: PipelineConfig = {
  pipelineId: '',
  sourceLanguage: 'English',
  targetLanguage: 'Italian',
  stages: [
    { id: 'stg-1', name: 'Draft', prompt: 'Translate literally.', model: 'gpt-4.1-mini', provider: 'openai', enabled: true },
  ],
  judgePrompt: 'Audit the translation.',
  judgeModel: 'gpt-4.1-mini',
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

  it('pays the fixed prompt overhead once per chunk, not once for the whole document', () => {
    // Ogni chunk viene tradotto con una chiamata separata al modello: il prompt di sistema
    // va pagato ad ogni chiamata, non una sola volta sull'intero documento.
    const oneChunk = [{ originalText: 'one two three four five six seven eight nine ten' }];
    const tenChunks = Array.from({ length: 10 }, () => ({ originalText: 'one two three four five six seven eight nine ten' }));

    const oneChunkResult = estimatePipelineCost(oneChunk, baseConfig);
    const tenChunksResult = estimatePipelineCost(tenChunks, baseConfig);

    const promptTokens = estimateTokens(baseConfig.stages[0].prompt);
    const wordsPerChunk = oneChunk[0].originalText.trim().split(/\s+/).length;
    const docTokensOne = Math.ceil(wordsPerChunk * 1.35);
    const docTokensTen = Math.ceil(wordsPerChunk * 10 * 1.35);
    expect(oneChunkResult.stages[0].inputTokens).toBe(docTokensOne + promptTokens);
    expect(tenChunksResult.stages[0].inputTokens).toBe(docTokensTen + promptTokens * 10);
    // Il costo totale non è lo stesso "spalmato" su più chunk: cresce con il numero di chiamate.
    expect(tenChunksResult.totalUsd).toBeGreaterThan((oneChunkResult.totalUsd ?? 0) * 5);
  });

  it('omits the coherence pass by default', () => {
    const result = estimatePipelineCost([{ originalText: 'Hello world' }], {
      ...baseConfig,
      coherencePrompt: 'Check consistency across chunks.',
    });
    expect(result.coherence).toBeNull();
  });

  it('includes the coherence pass only when explicitly requested and configured', () => {
    const withPrompt: PipelineConfig = { ...baseConfig, coherencePrompt: 'Check consistency across chunks.' };
    const withoutPrompt: PipelineConfig = { ...baseConfig, coherencePrompt: '' };

    const included = estimatePipelineCost([{ originalText: 'Hello world' }], withPrompt, undefined, { includeCoherence: true });
    const noPrompt = estimatePipelineCost([{ originalText: 'Hello world' }], withoutPrompt, undefined, { includeCoherence: true });

    expect(included.coherence).not.toBeNull();
    expect(noPrompt.coherence).toBeNull();
  });
});
