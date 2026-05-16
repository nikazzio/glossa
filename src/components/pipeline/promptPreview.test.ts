import { describe, expect, it } from 'vitest';
import type { PipelineConfig } from '../../types';
import { buildPromptPreviewStages } from './promptPreview';

function createConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    sourceLanguage: 'English',
    targetLanguage: 'Italian',
    stages: [],
    judgePrompt: 'Judge prompt',
    judgeModel: 'gpt-4o-mini',
    judgeProvider: 'openai',
    glossary: [],
    ...overrides,
  };
}

describe('buildPromptPreviewStages', () => {
  it('renders source-aware blocks with glossary, markdown and runtime placeholders', () => {
    const config = createConfig({
      sourceLanguage: 'Latin',
      targetLanguage: 'Italian',
      persona: 'You are a careful Latinist.',
      markdownAware: true,
      glossary: [
        { term: 'amor', translation: 'amore', notes: 'Use the emotional sense.' },
      ],
      stages: [
        {
          id: 'stg-translation',
          name: 'Translation',
          role: 'translation',
          prompt: 'Translate faithfully.',
          model: 'gpt-4o-mini',
          provider: 'openai',
          enabled: true,
        },
      ],
    });

    const [stage] = buildPromptPreviewStages(config);

    expect(stage?.role).toBe('translation');
    expect(stage?.blocks.map((block) => block.title)).toEqual([
      'System opener',
      'Structural preservation rules',
      'Glossary constraints',
      'Markdown preservation rules',
      'Stage instructions',
      'Runtime input',
      'Optional blob context',
      'Runtime output contract',
    ]);
    expect(stage?.blocks[0]?.body).toContain('careful Latinist');
    expect(stage?.blocks[2]?.body).toContain('| Source | Target | Notes |');
    expect(stage?.blocks[3]?.body).toContain('Preserve every Markdown marker exactly as needed');
    expect(stage?.blocks[5]?.body).toBe('{{SOURCE_CHUNK_TEXT}}');
    expect(stage?.blocks[6]?.body).toBe('{{BLOB_CONTEXT}}');
    expect(stage?.blocks[7]?.body).toBe('{{OUTPUT_CONTRACT}}');
  });

  it('renders format stages without glossary or persona blocks', () => {
    const config = createConfig({
      stages: [
        {
          id: 'stg-format',
          name: 'Format',
          role: 'format',
          prompt: 'Repair Markdown only.',
          model: 'gpt-4o-mini',
          provider: 'openai',
          enabled: true,
        },
      ],
    });

    const [stage] = buildPromptPreviewStages(config);

    expect(stage?.role).toBe('format');
    expect(stage?.blocks.map((block) => block.title)).toEqual([
      'System post-processor',
      'Stage instructions',
      'Runtime input',
      'Runtime output contract',
    ]);
    expect(stage?.blocks[0]?.body).toContain('deterministic text post-processor');
    expect(stage?.blocks[2]?.body).toBe('{{TEXT_TO_FORMAT}}');
    expect(stage?.blocks[3]?.body).toBe('Output only the formatted text.');
  });
});
