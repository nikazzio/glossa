import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PipelineConfig } from '../../types';
import { buildPromptPreviewStages } from './promptPreview';
import { PromptPreviewTab } from './PromptPreviewTab';

function createConfig(overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  return {
    pipelineId: '',
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
  it('renders translation blocks in real prompt order with cacheable blob context', () => {
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
    expect(stage?.blocks.map((block) => block.id)).toEqual([
      'system-opener',
      'structural-rules',
      'glossary-constraints',
      'markdown-rules',
      'blob-context',
      'stage-instructions',
      'current-chunk-id',
      'source-chunk-text',
      'runtime-task',
      'output-contract',
    ]);
    expect(stage?.blocks[0]?.body).toContain('careful Latinist');
    expect(stage?.blocks[2]?.body).toContain('Glossary Constraints:');
    expect(stage?.blocks[2]?.body).toContain('Treat every glossary entry as mandatory terminology');
    expect(stage?.blocks[2]?.body).toContain('| Source | Target | Notes |');
    expect(stage?.blocks[3]?.body).toContain('Preserve every Markdown marker exactly as needed');
    expect(stage?.blocks[4]?.body).toBe('{{BLOB_CONTEXT}}');
    expect(stage?.blocks[5]?.body).toContain('Glossary Reminder');
    expect(stage?.blocks[6]?.body).toBe('Current chunk id: {{CURRENT_CHUNK_ID}}');
    expect(stage?.blocks[7]?.body).toBe('Text to translate from the current chunk:\n{{SOURCE_CHUNK_TEXT}}');
    expect(stage?.blocks[8]?.body).toBe('Translate only the current chunk.');
    expect(stage?.blocks[9]?.body).toBe('Output only the translated text.');
  });

  it('renders refine blocks with original source and previous iteration placeholders', () => {
    const config = createConfig({
      glossary: [
        { term: 'amor', translation: 'amore' },
      ],
      stages: [
        {
          id: 'stg-refine',
          name: 'Refine',
          role: 'refine',
          prompt: 'Tighten the wording.',
          model: 'gpt-4o-mini',
          provider: 'openai',
          enabled: true,
        },
      ],
    });

    const [stage] = buildPromptPreviewStages(config);

    expect(stage?.role).toBe('refine');
    expect(stage?.blocks.map((block) => block.id)).toEqual([
      'system-opener',
      'structural-rules',
      'glossary-constraints',
      'blob-context',
      'stage-instructions',
      'current-chunk-id',
      'source-chunk-text',
      'previous-stage-result',
      'runtime-task',
      'output-contract',
    ]);
    expect(stage?.blocks[6]?.body).toBe('Original text for the current chunk:\n{{SOURCE_CHUNK_TEXT}}');
    expect(stage?.blocks[7]?.body).toBe('Previous Iteration for the current chunk:\n{{PREVIOUS_STAGE_RESULT}}');
    expect(stage?.blocks[8]?.body).toBe('Refine only the current chunk according to your instructions.');
    expect(stage?.blocks[9]?.body).toBe('Output the complete refined translation in full. Do not summarize, abbreviate, or output only the changed portions — rewrite the entire chunk from start to finish.');
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
    expect(stage?.blocks.map((block) => block.id)).toEqual([
      'system-post-processor',
      'stage-instructions',
      'source-chunk-text',
      'runtime-task',
      'output-contract',
    ]);
    expect(stage?.blocks[0]?.body).toContain('deterministic text post-processor');
    expect(stage?.blocks[2]?.body).toBe('Text to format from the current chunk:\n{{TEXT_TO_FORMAT}}');
    expect(stage?.blocks[3]?.body).toBe('Apply only the formatting instructions.');
    expect(stage?.blocks[4]?.body).toBe('Output only the formatted text.');
  });

  it('includes phrase-memory block after stage-instructions when usePhraseMemory is enabled', () => {
    const config = createConfig({
      usePhraseMemory: true,
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
    const blockIds = stage?.blocks.map((b) => b.id);
    const memoryIdx = blockIds?.indexOf('phrase-memory') ?? -1;
    const instructionsIdx = blockIds?.indexOf('stage-instructions') ?? -1;

    expect(memoryIdx).toBeGreaterThan(instructionsIdx);
    expect(stage?.blocks[memoryIdx]?.kind).toBe('runtime');
    expect(stage?.blocks[memoryIdx]?.body).toContain('Translation memory references');
    expect(stage?.blocks[memoryIdx]?.body).toContain('{{source phrase}}');
  });

  it('omits phrase-memory block when usePhraseMemory is disabled', () => {
    const config = createConfig({
      usePhraseMemory: false,
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
    expect(stage?.blocks.map((b) => b.id)).not.toContain('phrase-memory');
  });

  it('omits phrase-memory block in format stages even when usePhraseMemory is enabled', () => {
    const config = createConfig({
      usePhraseMemory: true,
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
    expect(stage?.blocks.map((b) => b.id)).not.toContain('phrase-memory');
  });

  it('renders empty glossary constraints explicitly when no glossary entries exist', () => {
    const config = createConfig({
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

    expect(stage?.blocks[2]?.body).toBe('Glossary Constraints:\n- No glossary entries were provided.');
  });

  it('renders a static few-shot-examples block after glossary constraints when examples are set', () => {
    const config = createConfig({
      fewShotExamples: [
        { id: 'fs-1', sourceText: 'Hello world', targetText: 'Ciao mondo' },
        { id: 'fs-2', sourceText: 'Good morning', targetText: 'Buongiorno', label: 'greeting' },
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

    expect(stage?.blocks.map((block) => block.id)).toEqual([
      'system-opener',
      'structural-rules',
      'glossary-constraints',
      'few-shot-examples',
      'blob-context',
      'stage-instructions',
      'current-chunk-id',
      'source-chunk-text',
      'runtime-task',
      'output-contract',
    ]);
    const fewShotBlock = stage?.blocks.find((block) => block.id === 'few-shot-examples');
    expect(fewShotBlock?.kind).toBe('static');
    expect(fewShotBlock?.body).toContain('Hello world');
    expect(fewShotBlock?.body).toContain('Ciao mondo');
    expect(fewShotBlock?.body).toContain('Good morning');
    expect(fewShotBlock?.body).toContain('Buongiorno');
  });

  it('omits the few-shot-examples block when no examples are set', () => {
    const config = createConfig({
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
    expect(stage?.blocks.map((block) => block.id)).not.toContain('few-shot-examples');
  });
});

describe('PromptPreviewTab accessibility', () => {
  it('uses a single tabpanel per active stage without duplicating the outer preview panel id', () => {
    const config = createConfig({
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
        {
          id: 'stg-refine',
          name: 'Refine',
          role: 'refine',
          prompt: 'Tighten the wording.',
          model: 'gpt-4o-mini',
          provider: 'openai',
          enabled: true,
        },
      ],
    });

    const { container } = render(createElement(PromptPreviewTab, { config }));

    expect(screen.getByRole('tablist', { name: 'pipeline.promptPreviewTitle' })).toBeInTheDocument();

    const selectedTab = screen.getByRole('tab', { selected: true });
    const controls = selectedTab.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(container.querySelectorAll('#pconfig-panel-preview')).toHaveLength(0);
    expect(controls && document.getElementById(controls)).toHaveAttribute('role', 'tabpanel');
  });
});
