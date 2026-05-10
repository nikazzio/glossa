import { beforeEach, describe, expect, it } from 'vitest';
import { usePipelineStore } from './pipelineStore';

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
        targetChunkCount: 0,
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
});
