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
        minWords: 0,
        maxWords: 0,
        headingAware: false,
        markdownAware: false,
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
    expect(useUiStore.getState().selectedChunkId).toBe(useChunksStore.getState().chunks[0].id);
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
    expect(useUiStore.getState().selectedChunkId).toBe(useChunksStore.getState().chunks[0].id);
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

    const chunkId = useChunksStore.getState().chunks[0].id;
    useChunksStore.getState().updateChunkOriginalText(chunkId, 'Edited source');

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

    useChunksStore.getState().splitChunk(useChunksStore.getState().chunks[0].id);
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

    const didSplit = useChunksStore.getState().splitChunkAt(useChunksStore.getState().chunks[0].id, 11);

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

  it('loadDocument with markdown footnotes separates processingText from displayText', () => {
    useChunksStore.getState().loadDocument('Body [^1].\n\n[^1]: A note.', {
      useChunking: false,
      markdownAware: true,
    });

    const chunk = useChunksStore.getState().chunks[0];
    // Chunk processing text has markers but no definition lines
    expect(chunk?.sourceProcessingText).toBe('Body [^1].');
    // Document-level display text retains the definition lines
    expect(usePipelineStore.getState().inputText).toContain('[^1]: A note.');
    // Document-level processing text strips definitions
    expect(usePipelineStore.getState().inputProcessingText).toBe('Body [^1].');
    // Footnote metadata is stored separately
    expect(usePipelineStore.getState().sourceFootnotes).toEqual([{ id: '1', text: 'A note.' }]);
  });

  it('sourceDisplayText on chunks is never mutated when a chunk transitions to completed', () => {
    usePipelineStore.getState().setInputText('First paragraph.\n\nSecond paragraph.');
    useChunksStore.getState().generateChunks();

    const originalDisplayTexts = useChunksStore.getState().chunks.map((c) => c.sourceDisplayText);

    // Simulate the pipeline completing and setting a draft
    useChunksStore.getState().setChunks((prev) =>
      prev.map((chunk) => ({
        ...chunk,
        status: 'completed' as const,
        translationDisplayText: 'Tradotto',
        translationProcessingText: 'Tradotto',
        currentDraft: 'Tradotto',
      })),
    );

    const afterDisplayTexts = useChunksStore.getState().chunks.map((c) => c.sourceDisplayText);
    expect(afterDisplayTexts).toEqual(originalDisplayTexts);
  });

  it('split preserves sourceDisplayText and sourceProcessingText on both halves', () => {
    useChunksStore.getState().loadDocument('Alpha beta gamma delta epsilon.', {
      useChunking: false,
    });

    const chunkId = useChunksStore.getState().chunks[0].id;
    useChunksStore.getState().splitChunkAt(chunkId, 11);

    const [first, second] = useChunksStore.getState().chunks;
    expect(first?.sourceDisplayText).toBeTruthy();
    expect(second?.sourceDisplayText).toBeTruthy();
    // Legacy field must stay in sync
    expect(first?.originalText).toBe(first?.sourceDisplayText);
    expect(second?.originalText).toBe(second?.sourceDisplayText);
    // After split, chunks have no pending translation
    expect(first?.translationDisplayText).toBe('');
    expect(second?.translationDisplayText).toBe('');
    expect(first?.currentDraft).toBe('');
    expect(second?.currentDraft).toBe('');
  });

  it('merge preserves combined sourceDisplayText on the resulting chunk', () => {
    useChunksStore.getState().loadDocument('Alpha.\n\nBeta.', {
      useChunking: true,
      targetChunkCount: 2,
    });

    const [first] = useChunksStore.getState().chunks;
    useChunksStore.getState().mergeChunkWithNext(first!.id);

    const merged = useChunksStore.getState().chunks[0];
    expect(merged?.sourceDisplayText).toContain('Alpha.');
    expect(merged?.sourceDisplayText).toContain('Beta.');
    // Legacy field must stay in sync
    expect(merged?.originalText).toBe(merged?.sourceDisplayText);
    // Merged chunk starts fresh with no translation
    expect(merged?.translationDisplayText).toBe('');
    expect(merged?.currentDraft).toBe('');
    expect(merged?.status).toBe('ready');
  });

  it('updateChunkOriginalText updates sourceDisplayText and sourceProcessingText', () => {
    usePipelineStore.getState().setInputText('Original text');
    useChunksStore.getState().generateChunks();

    const chunkId = useChunksStore.getState().chunks[0].id;
    useChunksStore.getState().updateChunkOriginalText(chunkId, 'Edited text');

    const chunk = useChunksStore.getState().chunks[0];
    expect(chunk?.sourceDisplayText).toBe('Edited text');
    expect(chunk?.sourceProcessingText).toBe('Edited text');
    expect(chunk?.originalText).toBe('Edited text');
  });
});
