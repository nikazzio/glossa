import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePipelineStore } from './pipelineStore';
import type { GlossaryEntry } from '../types';

const glossaryMocks = vi.hoisted(() => ({
  getGlossaryEntries: vi.fn<() => Promise<GlossaryEntry[]>>(),
}));

vi.mock('../services/glossaryService', () => ({
  getGlossaryEntries: glossaryMocks.getGlossaryEntries,
}));

describe('pipelineStore', () => {
  beforeEach(() => {
    usePipelineStore.setState({
      inputText: '',
      config: {
        sourceLanguage: 'English',
        targetLanguage: 'Italian',
        stages: [
          {
            id: 'stg-default',
            name: 'Initial Pass',
            prompt: 'Translate literally',
            model: 'gemini-3-flash-preview',
            provider: 'gemini',
            enabled: true,
          },
        ],
        judgePrompt: 'Judge',
        judgeModel: 'gemini-3-flash-preview',
        judgeProvider: 'gemini',
        glossary: [],
        useChunking: true,
        wordsPerChunk: 0,
      },
    });
  });

  it('stores input text independently from chunk runtime state', () => {
    usePipelineStore.getState().setInputText('Lorem ipsum');
    expect(usePipelineStore.getState().inputText).toBe('Lorem ipsum');
  });

  it('adds and updates stages inside config', () => {
    usePipelineStore.getState().addStage();
    const added = usePipelineStore.getState().config.stages.at(-1);
    expect(added?.name).toBe('New Stage');

    if (!added) throw new Error('expected stage');
    usePipelineStore.getState().updateStage(added.id, { name: 'Refinement' });
    expect(usePipelineStore.getState().config.stages.at(-1)?.name).toBe('Refinement');
  });

  it('removes only the targeted stage', () => {
    usePipelineStore.getState().addStage();
    const stages = usePipelineStore.getState().config.stages;
    const [first, second] = stages;
    if (!second) throw new Error('expected two stages');

    usePipelineStore.getState().removeStage(second.id);

    const remaining = usePipelineStore.getState().config.stages;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(first.id);
  });

  it('resetToDefaults clears text and reverts config', () => {
    usePipelineStore.getState().addStage();
    usePipelineStore.setState({ inputText: 'some text' });

    usePipelineStore.getState().resetToDefaults();

    expect(usePipelineStore.getState().inputText).toBe('');
    expect(usePipelineStore.getState().config.stages.length).toBeGreaterThan(0);
    const stageNames = usePipelineStore
      .getState()
      .config.stages.map((s) => s.name);
    expect(stageNames).not.toContain('New Stage');
  });

  it('assignGlossary clears glossary when called with null', async () => {
    usePipelineStore.setState((s) => ({
      config: {
        ...s.config,
        assignedGlossaryId: 'gloss-1',
        glossary: [{ term: 'API', translation: 'API' }],
      },
    }));

    await usePipelineStore.getState().assignGlossary(null);

    expect(usePipelineStore.getState().config.assignedGlossaryId).toBeNull();
    expect(usePipelineStore.getState().config.glossary).toHaveLength(0);
  });

  it('assignGlossary fetches entries and populates config', async () => {
    const entries: GlossaryEntry[] = [
      { term: 'runtime', translation: 'runtime', notes: 'keep as-is' },
    ];
    glossaryMocks.getGlossaryEntries.mockResolvedValueOnce(entries);

    await usePipelineStore.getState().assignGlossary('gloss-42');

    expect(usePipelineStore.getState().config.assignedGlossaryId).toBe('gloss-42');
    expect(usePipelineStore.getState().config.glossary).toEqual(entries);
  });
});
