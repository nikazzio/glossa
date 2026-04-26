import { beforeEach, describe, expect, it } from 'vitest';
import { usePipelineStore } from './pipelineStore';
import { useChunksStore } from './chunksStore';
import { useUiStore } from './uiStore';

describe('chunksStore', () => {
  beforeEach(() => {
    usePipelineStore.setState((state) => ({
      ...state,
      inputText: '',
      config: {
        ...state.config,
        useChunking: true,
        targetChunkCount: 0,
      },
    }));

    useChunksStore.setState({
      chunks: [],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });

    useUiStore.setState({
      viewMode: 'sandbox',
      documentLayout: 'auto',
      selectedChunkId: null,
      showSettings: false,
      showHelp: false,
      ollamaModels: [],
      ollamaStatus: 'unknown',
    });
  });

  it('generates chunks and switches to document mode for multi-chunk texts', () => {
    usePipelineStore.getState().setInputText('First paragraph.\n\nSecond paragraph.');
    useChunksStore.getState().generateChunks();

    expect(useChunksStore.getState().chunks).toHaveLength(2);
    expect(useUiStore.getState().viewMode).toBe('document');
    expect(useUiStore.getState().selectedChunkId).toBe('chunk-0');
  });

  it('keeps sandbox mode for a single generated chunk', () => {
    usePipelineStore.getState().setInputText('Single paragraph only.');
    usePipelineStore.getState().setConfig((prev) => ({ ...prev, useChunking: false }));

    useChunksStore.getState().generateChunks();

    expect(useChunksStore.getState().chunks).toHaveLength(1);
    expect(useUiStore.getState().viewMode).toBe('sandbox');
  });

  it('loads imported text into document mode even when it becomes a single chunk', () => {
    useChunksStore.getState().loadDocument('Single imported paragraph.', {
      useChunking: false,
      targetChunkCount: 0,
    });

    expect(useChunksStore.getState().chunks).toHaveLength(1);
    expect(useChunksStore.getState().chunks[0].originalText).toBe(
      'Single imported paragraph.',
    );
    expect(useUiStore.getState().viewMode).toBe('document');
    expect(useUiStore.getState().selectedChunkId).toBe('chunk-0');
  });

  it('resets derived data when editing source text', () => {
    usePipelineStore.getState().setInputText('Original');
    useChunksStore.getState().generateChunks();
    useChunksStore.getState().setChunks((prev) =>
      prev.map((chunk) => ({
        ...chunk,
        status: 'completed',
        currentDraft: 'Translated',
        stageResults: {
          'stg-1': { content: 'Translated', status: 'completed' },
        },
      })),
    );

    useChunksStore.getState().updateChunkOriginalText('chunk-0', 'Edited source');

    const chunk = useChunksStore.getState().chunks[0];
    expect(chunk.originalText).toBe('Edited source');
    expect(chunk.status).toBe('ready');
    expect(chunk.currentDraft).toBe('');
    expect(chunk.stageResults).toEqual({});
  });

  it('splits and merges editable chunks while preserving selection', () => {
    usePipelineStore.getState().setInputText('First sentence. Second sentence.');
    usePipelineStore.getState().setConfig((prev) => ({ ...prev, useChunking: false }));
    useChunksStore.getState().generateChunks();

    useChunksStore.getState().splitChunk('chunk-0');
    expect(useChunksStore.getState().chunks).toHaveLength(2);

    const firstChunkId = useChunksStore.getState().chunks[0].id;
    expect(useUiStore.getState().selectedChunkId).toBe(firstChunkId);

    useChunksStore.getState().mergeChunkWithNext(firstChunkId);
    expect(useChunksStore.getState().chunks).toHaveLength(1);
    expect(useUiStore.getState().selectedChunkId).toBe(
      useChunksStore.getState().chunks[0].id,
    );
  });

  it('splits a chunk at an explicit index chosen by the user', () => {
    useChunksStore.getState().loadDocument('Alpha beta gamma delta', {
      useChunking: false,
      targetChunkCount: 0,
    });

    const didSplit = useChunksStore.getState().splitChunkAt('chunk-0', 11);

    expect(didSplit).toBe(true);
    expect(useChunksStore.getState().chunks).toHaveLength(2);
    expect(useChunksStore.getState().chunks[0].originalText).toBe('Alpha beta');
    expect(useChunksStore.getState().chunks[1].originalText).toBe('gamma delta');
  });

  it('clears chunks and returns to sandbox mode', () => {
    usePipelineStore.getState().setInputText('A\n\nB');
    useChunksStore.getState().generateChunks();

    useChunksStore.getState().clearChunks();

    expect(useChunksStore.getState().chunks).toEqual([]);
    expect(useUiStore.getState().viewMode).toBe('sandbox');
    expect(useUiStore.getState().selectedChunkId).toBeNull();
  });
});
