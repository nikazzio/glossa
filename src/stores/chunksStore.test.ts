import { beforeEach, describe, expect, it } from 'vitest';
import { usePipelineStore } from './pipelineStore';
import { useChunksStore, flushPendingTokenBatch } from './chunksStore';
import { useUiStore } from './uiStore';

describe('chunksStore', () => {
  beforeEach(() => {
    usePipelineStore.setState((state) => ({
      ...state,
      inputText: '',
      config: {
        ...state.config,
        useChunking: true,
        wordsPerChunk: 0,
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

    // Reset the module-level RAF batch state (pendingBatch + rafHandle).
    // This must be called explicitly because the Zustand subscribe only resets chunkIndex.
    flushPendingTokenBatch();
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
      targetWordsPerChunk: 0,
    });

    expect(useChunksStore.getState().chunks).toHaveLength(1);
    expect(useChunksStore.getState().chunks[0].originalText).toBe(
      'Single imported paragraph.',
    );
    expect(useUiStore.getState().viewMode).toBe('document');
    expect(useUiStore.getState().selectedChunkId).toBe(useChunksStore.getState().chunks[0].id);
  });

  it('marks existing translation stale when editing source text', () => {
    usePipelineStore.getState().setInputText('Original');
    useChunksStore.getState().generateChunks();
    useChunksStore.getState().setChunks((prev) =>
      prev.map((chunk) => ({
        ...chunk,
        status: 'completed',
        currentDraft: 'Translated',
        translationDisplayText: 'Translated',
        translationProcessingText: 'Translated',
        stageResults: {
          'stg-1': { content: 'Translated', status: 'completed' },
        },
      })),
    );

    const chunkId = useChunksStore.getState().chunks[0].id;
    useChunksStore.getState().updateChunkOriginalText(chunkId, 'Edited source');

    const chunk = useChunksStore.getState().chunks[0];
    expect(chunk.originalText).toBe('Original');
    expect(chunk.status).toBe('completed');
    expect(chunk.currentDraft).toBe('Translated');
    expect(chunk.stageResults).toEqual({
      'stg-1': { content: 'Translated', status: 'completed' },
    });
    expect(chunk.translationStale).toBe(true);
  });

  it('toggles source editing for completed chunks without discarding translation', () => {
    usePipelineStore.getState().setInputText('Original');
    useChunksStore.getState().generateChunks();
    useChunksStore.getState().setChunks((prev) =>
      prev.map((chunk) => ({
        ...chunk,
        status: 'completed',
        currentDraft: 'Translated',
        translationDisplayText: 'Translated',
        translationProcessingText: 'Translated',
        stageResults: {
          'stg-1': { content: 'Translated', status: 'completed' },
        },
      })),
    );

    const chunkId = useChunksStore.getState().chunks[0].id;

    useChunksStore.getState().toggleChunkSourceEditing(chunkId);
    let chunk = useChunksStore.getState().chunks[0];
    expect(chunk.sourceEditable).toBe(true);
    expect(chunk.currentDraft).toBe('Translated');
    expect(chunk.stageResults).toEqual({
      'stg-1': { content: 'Translated', status: 'completed' },
    });

    useChunksStore.getState().toggleChunkSourceEditing(chunkId);
    chunk = useChunksStore.getState().chunks[0];
    expect(chunk.sourceEditable).toBe(false);
    expect(chunk.currentDraft).toBe('Translated');
  });

  it('clears chunks and returns to sandbox mode', () => {
    usePipelineStore.getState().setInputText('A\n\nB');
    useChunksStore.getState().generateChunks();

    useChunksStore.getState().clearChunks();

    expect(useChunksStore.getState().chunks).toEqual([]);
    expect(useUiStore.getState().viewMode).toBe('sandbox');
    expect(useUiStore.getState().selectedChunkId).toBeNull();
  });

  it('clears stale blob assignments when a chunk is missing from recomputation results', () => {
    useChunksStore.getState().loadDocument('Alpha.\n\nBeta.', {
      useChunking: true,
      targetWordsPerChunk: 0,
    });

    const [first, second] = useChunksStore.getState().chunks;
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    useChunksStore.getState().setBlobAssignments([
      { chunkId: first!.id, blobId: 'blob-old', position: 0, referenceChunkIds: [first!.id, second!.id] },
      { chunkId: second!.id, blobId: 'blob-old', position: 1, referenceChunkIds: [first!.id, second!.id] },
    ]);
    useChunksStore.getState().setBlobAssignments([
      { chunkId: first!.id, blobId: 'blob-new', position: 0, referenceChunkIds: [first!.id] },
    ]);

    const [updatedFirst, updatedSecond] = useChunksStore.getState().chunks;
    expect(updatedFirst?.blobId).toBe('blob-new');
    expect(updatedSecond?.blobId).toBeUndefined();
    expect(updatedSecond?.blobOrder).toBeUndefined();
    expect(updatedSecond?.blobReferenceChunkIds).toBeUndefined();
  });

  it('loadDocument with markdown footnotes separates processingText from displayText', () => {
    useChunksStore.getState().loadDocument('Body [^1].\n\n[^1]: A note.', {
      useChunking: false,
      markdownAware: true,
    });

    const chunk = useChunksStore.getState().chunks[0];
    // Chunk processing text is clean — footnote markers stripped, nothing goes to LLM
    expect(chunk?.sourceProcessingText).toBe('Body .');
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

  it('updateChunkOriginalText updates sourceDisplayText and sourceProcessingText', () => {
    usePipelineStore.getState().setInputText('Original text');
    useChunksStore.getState().generateChunks();

    const chunkId = useChunksStore.getState().chunks[0].id;
    useChunksStore.getState().updateChunkOriginalText(chunkId, 'Edited text');

    const chunk = useChunksStore.getState().chunks[0];
    expect(chunk?.sourceDisplayText).toBe('Edited text');
    expect(chunk?.sourceProcessingText).toBe('Edited text');
    expect(chunk?.originalText).toBe('Original text');
  });

  it('updateChunkOriginalText is a no-op when the source text is unchanged', () => {
    usePipelineStore.getState().setInputText('Original text');
    useChunksStore.getState().generateChunks();

    const before = useChunksStore.getState().chunks;
    const chunkId = before[0].id;

    useChunksStore.getState().updateChunkOriginalText(chunkId, 'Original text');

    expect(useChunksStore.getState().chunks).toBe(before);
  });

  describe('O(1) index — per-id updates only touch the target chunk', () => {
    it('updateChunkStatus leaves sibling chunk references unchanged', () => {
      usePipelineStore.getState().setInputText('A.\n\nB.\n\nC.');
      useChunksStore.getState().generateChunks();

      const chunks = useChunksStore.getState().chunks;
      expect(chunks).toHaveLength(3);
      const beforeB = chunks[1];
      const beforeC = chunks[2];

      useChunksStore.getState().updateChunkStatus(chunks[0]!.id, 'processing');

      const after = useChunksStore.getState().chunks;
      expect(after[0]!.status).toBe('processing');
      expect(after[1]).toBe(beforeB);
      expect(after[2]).toBe(beforeC);
    });

    it('updateChunkStage leaves sibling chunk references unchanged', () => {
      usePipelineStore.getState().setInputText('A.\n\nB.\n\nC.');
      useChunksStore.getState().generateChunks();

      const chunks = useChunksStore.getState().chunks;
      const beforeA = chunks[0];
      const beforeC = chunks[2];

      useChunksStore.getState().updateChunkStage(chunks[1]!.id, 'stg-1', { content: 'x', status: 'processing' });

      const after = useChunksStore.getState().chunks;
      expect(after[1]!.stageResults['stg-1']?.content).toBe('x');
      expect(after[0]).toBe(beforeA);
      expect(after[2]).toBe(beforeC);
    });

    it('handles updates to chunks deep in a large list without touching siblings', () => {
      const texts = Array.from({ length: 50 }, (_, i) => `Paragraph ${i}.`);
      useChunksStore.getState().loadDocument(texts.join('\n\n'), { useChunking: true });

      const chunks = useChunksStore.getState().chunks;
      expect(chunks.length).toBeGreaterThan(10);

      const targetIdx = Math.floor(chunks.length / 2);
      const targetId = chunks[targetIdx]!.id;
      const beforePrev = chunks[targetIdx - 1];
      const beforeNext = chunks[targetIdx + 1];

      useChunksStore.getState().updateChunkStatus(targetId, 'processing');

      const after = useChunksStore.getState().chunks;
      expect(after[targetIdx]!.status).toBe('processing');
      expect(after[targetIdx - 1]).toBe(beforePrev);
      expect(after[targetIdx + 1]).toBe(beforeNext);
    });

  });

  describe('RAF token batching — appendChunkStageContent', () => {
    it('accumulates multiple tokens into a single update on flush', () => {
      usePipelineStore.getState().setInputText('Test paragraph.');
      useChunksStore.getState().generateChunks();

      const chunkId = useChunksStore.getState().chunks[0]!.id;

      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', 'Hello');
      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', ' world');
      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', '!');

      flushPendingTokenBatch();

      const chunk = useChunksStore.getState().chunks[0];
      expect(chunk?.stageResults['stg-1']?.content).toBe('Hello world!');
    });

    it('flushes the previous batch immediately when the stage changes', () => {
      usePipelineStore.getState().setInputText('Test paragraph.');
      useChunksStore.getState().generateChunks();

      const chunkId = useChunksStore.getState().chunks[0]!.id;

      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', 'Alpha');
      // Different stageId — triggers immediate flush of stg-1 batch before stg-2 starts
      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-2', 'Beta');
      flushPendingTokenBatch();

      const chunk = useChunksStore.getState().chunks[0];
      expect(chunk?.stageResults['stg-1']?.content).toBe('Alpha');
      expect(chunk?.stageResults['stg-2']?.content).toBe('Beta');
    });

    it('flushes the previous batch immediately when the chunkId changes', () => {
      usePipelineStore.getState().setInputText('A.\n\nB.');
      useChunksStore.getState().generateChunks();

      const [chunkA, chunkB] = useChunksStore.getState().chunks;

      useChunksStore.getState().appendChunkStageContent(chunkA!.id, 'stg-1', 'TokenA');
      // Different chunkId — triggers immediate flush of chunkA's batch before chunkB starts
      useChunksStore.getState().appendChunkStageContent(chunkB!.id, 'stg-1', 'TokenB');
      flushPendingTokenBatch();

      const chunks = useChunksStore.getState().chunks;
      expect(chunks[0]?.stageResults['stg-1']?.content).toBe('TokenA');
      expect(chunks[1]?.stageResults['stg-1']?.content).toBe('TokenB');
    });

    it('appends to existing stage content on subsequent flushes', () => {
      usePipelineStore.getState().setInputText('Test paragraph.');
      useChunksStore.getState().generateChunks();

      const chunkId = useChunksStore.getState().chunks[0]!.id;

      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', 'Part one ');
      flushPendingTokenBatch();

      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', 'part two');
      flushPendingTokenBatch();

      const chunk = useChunksStore.getState().chunks[0];
      expect(chunk?.stageResults['stg-1']?.content).toBe('Part one part two');
    });

    it('leaves sibling chunks untouched during token streaming', () => {
      // The immutability guarantee lives in flushPendingTokenBatch (via updateSingleChunk),
      // so we verify sibling references after an explicit flush.
      usePipelineStore.getState().setInputText('A.\n\nB.\n\nC.');
      useChunksStore.getState().generateChunks();

      const [a, b, c] = useChunksStore.getState().chunks;
      const beforeB = b;
      const beforeC = c;

      useChunksStore.getState().appendChunkStageContent(a!.id, 'stg-1', 'token');
      flushPendingTokenBatch();

      const after = useChunksStore.getState().chunks;
      expect(after[1]).toBe(beforeB);
      expect(after[2]).toBe(beforeC);
    });

    it('is a no-op when there is no pending batch', () => {
      usePipelineStore.getState().setInputText('Test paragraph.');
      useChunksStore.getState().generateChunks();

      const before = useChunksStore.getState().chunks[0];
      flushPendingTokenBatch();
      expect(useChunksStore.getState().chunks[0]).toBe(before);
    });

    it('updateChunkStage drops the pending batch for the same stage to prevent token duplication', () => {
      usePipelineStore.getState().setInputText('Test paragraph.');
      useChunksStore.getState().generateChunks();

      const chunkId = useChunksStore.getState().chunks[0]!.id;

      // Simulate tokens arriving during streaming
      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', 'Hello ');
      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', 'world');

      // Pipeline writes the final result before the RAF fires
      useChunksStore.getState().updateChunkStage(chunkId, 'stg-1', { content: 'Hello world', status: 'completed' });

      // RAF flush would have appended buffered tokens — with the fix they are dropped
      flushPendingTokenBatch();

      const chunk = useChunksStore.getState().chunks[0];
      expect(chunk?.stageResults['stg-1']?.content).toBe('Hello world');
      expect(chunk?.stageResults['stg-1']?.status).toBe('completed');
    });

    it('updateChunkStage for a different stage does not drop the pending batch', () => {
      usePipelineStore.getState().setInputText('Test paragraph.');
      useChunksStore.getState().generateChunks();

      const chunkId = useChunksStore.getState().chunks[0]!.id;

      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-2', 'Pending');
      // Writing a different stage should not discard stg-2 tokens
      useChunksStore.getState().updateChunkStage(chunkId, 'stg-1', { content: 'Done', status: 'completed' });
      flushPendingTokenBatch();

      const chunk = useChunksStore.getState().chunks[0];
      expect(chunk?.stageResults['stg-1']?.content).toBe('Done');
      expect(chunk?.stageResults['stg-2']?.content).toBe('Pending');
    });

    it('clearChunkStages drops the pending batch to prevent re-adding cleared content', () => {
      usePipelineStore.getState().setInputText('Test paragraph.');
      useChunksStore.getState().generateChunks();

      const chunkId = useChunksStore.getState().chunks[0]!.id;

      useChunksStore.getState().appendChunkStageContent(chunkId, 'stg-1', 'Stale token');

      // Pipeline resets the chunk before the RAF fires
      useChunksStore.getState().clearChunkStages(chunkId);

      // RAF flush would have re-added the cleared stage — with the fix it is a no-op
      flushPendingTokenBatch();

      const chunk = useChunksStore.getState().chunks[0];
      expect(chunk?.stageResults).toEqual({});
    });
  });

  describe('preview workflow — resetPreviewChunks and resetAllChunks', () => {
    it('resetPreviewChunks resets only preview chunks back to ready', () => {
      usePipelineStore.getState().setInputText('A.\n\nB.\n\nC.');
      useChunksStore.getState().generateChunks();
      const [a, b, c] = useChunksStore.getState().chunks;

      useChunksStore.getState().updateChunkStatus(a!.id, 'preview');
      useChunksStore.getState().updateChunkStatus(b!.id, 'completed');
      // c remains ready

      useChunksStore.getState().resetPreviewChunks();

      const after = useChunksStore.getState().chunks;
      expect(after[0]!.status).toBe('ready');
      expect(after[1]!.status).toBe('completed');
      expect(after[2]!.status).toBe('ready');
    });

    it('resetPreviewChunks clears draft and stage results from preview chunks', () => {
      usePipelineStore.getState().setInputText('Hello world.');
      useChunksStore.getState().generateChunks();
      const chunkId = useChunksStore.getState().chunks[0]!.id;

      useChunksStore.getState().updateChunkDraft(chunkId, 'Ciao mondo');
      useChunksStore.getState().updateChunkStage(chunkId, 'stg-1', { content: 'Ciao mondo', status: 'completed' });
      useChunksStore.getState().updateChunkStatus(chunkId, 'preview');

      useChunksStore.getState().resetPreviewChunks();

      const chunk = useChunksStore.getState().chunks[0];
      expect(chunk?.status).toBe('ready');
      expect(chunk?.currentDraft).toBe('');
      expect(chunk?.stageResults).toEqual({});
    });

    it('resetAllChunks resets completed and preview chunks but leaves ready ones untouched', () => {
      usePipelineStore.getState().setInputText('A.\n\nB.\n\nC.');
      useChunksStore.getState().generateChunks();
      const [a, b, c] = useChunksStore.getState().chunks;

      useChunksStore.getState().updateChunkStatus(a!.id, 'completed');
      useChunksStore.getState().updateChunkStatus(b!.id, 'preview');
      // c stays ready

      const beforeC = useChunksStore.getState().chunks[2];
      useChunksStore.getState().resetAllChunks();

      const after = useChunksStore.getState().chunks;
      expect(after[0]!.status).toBe('ready');
      expect(after[1]!.status).toBe('ready');
      expect(after[2]).toBe(beforeC);
    });

    it('updateChunkStatus to preview does not set sourceEditable', () => {
      usePipelineStore.getState().setInputText('Test.');
      useChunksStore.getState().generateChunks();
      const chunkId = useChunksStore.getState().chunks[0]!.id;

      useChunksStore.getState().updateChunkStatus(chunkId, 'preview');

      const chunk = useChunksStore.getState().chunks[0];
      expect(chunk?.status).toBe('preview');
      expect(chunk?.sourceEditable).toBe(false);
    });
  });
});
