import { create } from 'zustand';
import type {
  ChunkStatus,
  CoherenceResult,
  JudgeResult,
  PipelineResult,
  PromptInfo,
  TranslationChunk,
} from '../types';
import { usePipelineStore } from './pipelineStore';
import { useUiStore } from './uiStore';
import {
  chunkText,
  findBestSplitIndex,
  generateId,
  qualityDefault,
  resolveSplitIndex,
  trimSplitFragment,
} from '../utils';
import {
  buildChunkFootnotes,
  composeDocumentDisplayText,
  composeDocumentProcessingText,
  deriveChunkDisplayText,
  deriveSourceDocumentState,
  updateChunkSourceFields,
  updateChunkTranslationFields,
  withSyncedChunkFields,
} from '../utils/documentState';

// --- Internal O(1) chunk index ---
// Maps chunkId → array index. Kept as a module-level variable; never part of Zustand state.
// Rebuilt automatically via store subscription whenever `chunks` reference changes —
// this covers both action-dispatched updates and direct setState calls from tests.
let chunkIndex = new Map<string, number>();

function rebuildIndex(chunks: TranslationChunk[]): void {
  chunkIndex = new Map(chunks.map((c, i) => [c.id, i]));
}

// O(1) id lookup. Produces a new array with only the target slot replaced
// (vs .map() which allocates n new objects regardless of which one matched).
function updateSingleChunk(
  chunks: TranslationChunk[],
  chunkId: string,
  updater: (chunk: TranslationChunk) => TranslationChunk,
): TranslationChunk[] {
  const idx = chunkIndex.get(chunkId);
  if (idx === undefined) return chunks;
  const next = [...chunks];
  next[idx] = updater(next[idx]!); // safe: idx mirrors the live chunks array via subscribe
  return next;
}

// --- RAF token batching ---
// Accumulates tokens for the active (chunkId, stageId) between animation frames,
// collapsing N per-token setState calls into a single commit per frame.
type TokenBatch = { chunkId: string; stageId: string; content: string };
let pendingBatch: TokenBatch | null = null;
let rafHandle: ReturnType<typeof requestAnimationFrame> | null = null;

function cancelRaf(): void {
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
}

// Drop buffered tokens for a specific (chunkId, stageId) pair without applying them.
// Called by updateChunkStage before writing a final result to prevent stale tokens
// from being appended on the next RAF flush after the stage is already complete.
function dropPendingBatch(chunkId: string, stageId: string): void {
  if (pendingBatch?.chunkId === chunkId && pendingBatch?.stageId === stageId) {
    cancelRaf();
    pendingBatch = null;
  }
}

// Drop any buffered tokens for a chunk, regardless of stage.
// Called by clearChunkStages to prevent a pending flush from re-adding cleared content.
function dropPendingBatchForChunk(chunkId: string): void {
  if (pendingBatch?.chunkId === chunkId) {
    cancelRaf();
    pendingBatch = null;
  }
}

// Exported so tests can flush synchronously without needing RAF stubs.
// Also cancels any in-flight RAF handle to prevent double-application after a manual flush.
export function flushPendingTokenBatch(): void {
  cancelRaf();
  if (!pendingBatch) return;
  const { chunkId, stageId, content } = pendingBatch;
  pendingBatch = null;
  useChunksStore.setState((state) => ({
    chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
      ...chunk,
      stageResults: {
        ...chunk.stageResults,
        [stageId]: {
          ...(chunk.stageResults[stageId] ?? { status: 'processing' }),
          content: (chunk.stageResults[stageId]?.content ?? '') + content,
        },
      },
    })),
  }));
}

interface ChunksState {
  chunks: TranslationChunk[];
  isProcessing: boolean;
  cancelRequested: boolean;
  activeStreamId: string | null;

  setChunks: (updater: TranslationChunk[] | ((prev: TranslationChunk[]) => TranslationChunk[])) => void;
  setIsProcessing: (processing: boolean) => void;
  requestCancel: () => void;
  clearCancelRequest: () => void;
  setActiveStreamId: (id: string | null) => void;

  generateChunks: () => void;
  loadDocument: (
    text: string,
    options?: {
      useChunking?: boolean;
      targetChunkCount?: number;
      markdownAware?: boolean;
      minWords?: number;
      maxWords?: number;
      headingAware?: boolean;
      carryTrailingShortBlocks?: boolean;
      extractFootnotes?: boolean;
    },
    precomputedChunks?: string[],
  ) => void;
  clearChunks: () => void;
  updateChunkStage: (chunkId: string, stageId: string, result: PipelineResult) => void;
  appendChunkStageContent: (chunkId: string, stageId: string, token: string) => void;
  setChunkStagePromptInfo: (chunkId: string, stageId: string, promptInfo: PromptInfo) => void;
  updateChunkJudge: (chunkId: string, result: JudgeResult) => void;
  updateChunkDraft: (chunkId: string, draft: string) => void;
  toggleChunkTranslationLock: (chunkId: string) => void;
  updateChunkStatus: (chunkId: string, status: ChunkStatus) => void;
  updateChunkOriginalText: (chunkId: string, text: string) => void;
  updateChunkCoherence: (chunkId: string, result: CoherenceResult) => void;
  splitChunk: (chunkId: string) => void;
  splitChunkAt: (chunkId: string, splitAt: number) => boolean;
  mergeChunkWithNext: (chunkId: string) => void;
  resetCompletedChunks: () => void;
  resetAllChunks: () => void;
  unlockChunkForEdit: (chunkId: string) => void;
  clearChunkStages: (chunkId: string) => void;
  setBlobAssignments: (
    assignments: Array<{ chunkId: string; blobId: string; position: number; referenceChunkIds: string[] }>
  ) => void;
}

export const useChunksStore = create<ChunksState>((set, get) => ({
  chunks: [],
  isProcessing: false,
  cancelRequested: false,
  activeStreamId: null,

  setChunks: (updater) =>
    set((state) => {
      const nextChunks =
        typeof updater === 'function' ? updater(state.chunks) : updater;
      syncSelectedChunk(nextChunks);
      return { chunks: nextChunks };
    }),

  setIsProcessing: (processing) => set({ isProcessing: processing }),
  requestCancel: () => set({ cancelRequested: true }),
  clearCancelRequest: () => set({ cancelRequested: false }),
  setActiveStreamId: (id) => set({ activeStreamId: id }),

  generateChunks: () => {
    const pipeline = usePipelineStore.getState();
    const { inputProcessingText, sourceFootnotes, config } = pipeline;
    if (!inputProcessingText.trim()) return;

    const chunks = buildChunks(inputProcessingText, {
      useChunking: config.useChunking,
      targetChunkCount: config.targetChunkCount,
      markdownAware: config.markdownAware,
      minWords: config.minWords,
      maxWords: config.maxWords,
      headingAware: config.headingAware,
      carryTrailingShortBlocks: config.carryTrailingShortBlocks,
    }, sourceFootnotes);

    const ui = useUiStore.getState();
    ui.setViewMode(chunks.length > 1 ? 'document' : 'sandbox');
    if (chunks.length > 1) ui.setShowChunkDrawer(true);
    syncSelectedChunk(chunks);
    set({ chunks });
  },

  loadDocument: (text, options = {}, precomputedChunks) => {
    const sourceDocument = deriveSourceDocumentState(text, options);
    if (!sourceDocument.displayText.trim()) return;

    const chunkTexts = precomputedChunks ?? chunkText(sourceDocument.processingText, options);
    const chunks = chunksFromTexts(chunkTexts, sourceDocument.footnotes);
    const ui = useUiStore.getState();
    usePipelineStore.getState().setSourceDocument({
      displayText: sourceDocument.displayText,
      processingText: sourceDocument.processingText,
      sourceFootnotes: sourceDocument.footnotes,
      renderProfile: sourceDocument.renderProfile,
    });
    ui.setViewMode('document');
    ui.setShowChunkDrawer(true);
    syncSelectedChunk(chunks);
    set({ chunks });
  },

  clearChunks: () => {
    useUiStore.getState().setSelectedChunkId(null);
    useUiStore.getState().setViewMode('sandbox');
    set({ chunks: [] });
  },

  updateChunkStage: (chunkId, stageId, result) => {
    // Drop any buffered tokens for this stage before writing the final result.
    // Without this, the next RAF flush would append stale tokens onto the completed content.
    dropPendingBatch(chunkId, stageId);
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        stageResults: { ...chunk.stageResults, [stageId]: result },
      })),
    }));
  },

  setChunkStagePromptInfo: (chunkId, stageId, promptInfo) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        stageResults: {
          ...chunk.stageResults,
          [stageId]: {
            ...(chunk.stageResults[stageId] ?? { content: '', status: 'processing' as const }),
            promptInfo,
          },
        },
      })),
    })),

  // Buffers tokens per animation frame instead of committing on every token.
  // If the active (chunkId, stageId) pair changes, the previous batch is flushed immediately.
  appendChunkStageContent: (chunkId, stageId, token) => {
    if (pendingBatch?.chunkId === chunkId && pendingBatch?.stageId === stageId) {
      pendingBatch = { chunkId, stageId, content: pendingBatch.content + token };
    } else {
      flushPendingTokenBatch();
      pendingBatch = { chunkId, stageId, content: token };
    }
    if (rafHandle === null) {
      rafHandle = requestAnimationFrame(() => flushPendingTokenBatch());
    }
  },

  updateChunkJudge: (chunkId, result) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        judgeResult: result,
      })),
    })),

  updateChunkDraft: (chunkId, draft) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) =>
        chunk.translationLocked ? chunk : updateChunkTranslationFields(chunk, draft),
      ),
    })),

  toggleChunkTranslationLock: (chunkId) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        translationLocked: !chunk.translationLocked,
      })),
    })),

  updateChunkStatus: (chunkId, status) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        status,
        ...(status === 'processing' ? { translationStale: false } : {}),
      })),
    })),

  updateChunkOriginalText: (chunkId, text) =>
    set((state) => {
      const sourceFootnotes = usePipelineStore.getState().sourceFootnotes;
      const nextChunks = updateSingleChunk(state.chunks, chunkId, (chunk) => {
        if (chunk.originalText === text) return chunk;
        const hasTranslation = !!(chunk.currentDraft || Object.keys(chunk.stageResults).length > 0);
        const updated = updateChunkSourceFields(
          chunk,
          deriveChunkDisplayText(text, sourceFootnotes),
          text,
          buildChunkFootnotes(text, sourceFootnotes),
        );
        return hasTranslation ? { ...updated, translationStale: true } : updated;
      });
      syncProjectSourceDocument(nextChunks);
      return { chunks: nextChunks };
    }),

  updateChunkCoherence: (chunkId, result) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        coherenceResult: result,
      })),
    })),

  splitChunk: (chunkId) =>
    set((state) => {
      const chunkIdx = chunkIndex.get(chunkId);
      if (chunkIdx === undefined) return {};
      const chunk = state.chunks[chunkIdx]!;
      const splitAt = findBestSplitIndex(chunk.sourceProcessingText, {
        markdownAware: usePipelineStore.getState().config.markdownAware,
      });
      if (!splitAt) return {};

      return splitChunkState(state.chunks, chunkId, splitAt) ?? {};
    }),

  splitChunkAt: (chunkId, splitAt) => {
    let didSplit = false;

    set((state) => {
      const next = splitChunkState(state.chunks, chunkId, splitAt);
      if (!next) return {};
      didSplit = true;
      return next;
    });

    return didSplit;
  },

  mergeChunkWithNext: (chunkId) =>
    set((state) => {
      const index = chunkIndex.get(chunkId);
      if (index === undefined || index >= state.chunks.length - 1) return {};

      const current = state.chunks[index];
      const next = state.chunks[index + 1];
      const isDirty = (status: ChunkStatus) =>
        status === 'completed' || status === 'processing';
      if (isDirty(current.status) || isDirty(next.status)) return {};

      const mergedProcessingText = `${current.sourceProcessingText}\n\n${next.sourceProcessingText}`;
      const sourceFootnotes = usePipelineStore.getState().sourceFootnotes;
      const merged = resetChunkForSourceEdit(
        updateChunkSourceFields(
          current,
          deriveChunkDisplayText(mergedProcessingText, sourceFootnotes),
          mergedProcessingText,
          buildChunkFootnotes(mergedProcessingText, sourceFootnotes),
        ),
      );

      const chunks = [
        ...state.chunks.slice(0, index),
        merged,
        ...state.chunks.slice(index + 2),
      ];
      syncProjectSourceDocument(chunks);
      syncSelectedChunk(chunks, merged.id);
      return { chunks };
    }),

  resetCompletedChunks: () =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.status === 'completed' ? resetChunkForSourceEdit(chunk) : chunk,
      ),
    })),

  resetAllChunks: () =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.status !== 'ready' ? resetChunkForSourceEdit(chunk) : chunk,
      ),
    })),

  unlockChunkForEdit: (chunkId) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) =>
        chunk.status === 'completed' ? resetChunkForSourceEdit(chunk) : chunk,
      ),
    })),

  clearChunkStages: (chunkId) => {
    // Drop any pending tokens for this chunk before clearing stages.
    // Without this, the next RAF flush would re-add stageResults after the clear.
    dropPendingBatchForChunk(chunkId);
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        stageResults: {},
      })),
    }));
  },

  setBlobAssignments: (assignments) => {
    const map = new Map(assignments.map((a) => [
      a.chunkId,
      {
        blobId: a.blobId,
        blobOrder: a.position,
        blobReferenceChunkIds: a.referenceChunkIds,
      },
    ]));
    set((state) => ({
      chunks: state.chunks.map((chunk) => {
        const assignment = map.get(chunk.id);
        if (!assignment) {
          return {
            ...chunk,
            blobId: undefined,
            blobOrder: undefined,
            blobReferenceChunkIds: undefined,
          };
        }
        return {
          ...chunk,
          blobId: assignment.blobId,
          blobOrder: assignment.blobOrder,
          blobReferenceChunkIds: assignment.blobReferenceChunkIds,
        };
      }),
    }));
  },

}));

function createEmptyJudgeResult(): JudgeResult {
  return { content: '', status: 'idle', rating: qualityDefault(), issues: [] };
}

function resetChunkForSourceEdit<T extends TranslationChunk>(chunk: T): T {
  return withSyncedChunkFields({
    ...chunk,
    status: 'ready',
    stageResults: {},
    judgeResult: createEmptyJudgeResult(),
    coherenceResult: undefined,
    footnotes: buildChunkFootnotes(
      chunk.sourceProcessingText,
      usePipelineStore.getState().sourceFootnotes,
    ),
    translationDisplayText: '',
    translationProcessingText: '',
    currentDraft: '',
    translationLocked: false,
    translationStale: false,
  }) as T;
}

function chunksFromTexts(
  chunkTexts: string[],
  sourceFootnotes: ReturnType<typeof usePipelineStore.getState>['sourceFootnotes'],
): TranslationChunk[] {
  return chunkTexts.map((chunkTextValue) => {
    const footnotes = buildChunkFootnotes(chunkTextValue, sourceFootnotes);
    return withSyncedChunkFields({
      id: generateId('chunk'),
      sourceDisplayText: deriveChunkDisplayText(chunkTextValue, sourceFootnotes),
      sourceProcessingText: chunkTextValue,
      translationDisplayText: '',
      translationProcessingText: '',
      status: 'ready' as const,
      stageResults: {},
      judgeResult: createEmptyJudgeResult(),
      translationLocked: false,
      ...(footnotes?.length ? { footnotes } : {}),
    });
  });
}

function buildChunks(
  text: string,
  options: {
    useChunking?: boolean;
    targetChunkCount?: number;
    markdownAware?: boolean;
    minWords?: number;
    maxWords?: number;
    headingAware?: boolean;
    carryTrailingShortBlocks?: boolean;
  },
  sourceFootnotes: ReturnType<typeof usePipelineStore.getState>['sourceFootnotes'],
): TranslationChunk[] {
  return chunksFromTexts(chunkText(text, options), sourceFootnotes);
}

function splitChunkState(
  chunks: TranslationChunk[],
  chunkId: string,
  splitAt: number,
): { chunks: TranslationChunk[] } | null {
  const index = chunkIndex.get(chunkId);
  if (index === undefined) return null;

  const chunk = chunks[index];
  if (chunk.status === 'completed' || chunk.status === 'processing') return null;

  const boundedSplitAt = resolveSplitIndex(chunk.sourceProcessingText, splitAt, {
    markdownAware: usePipelineStore.getState().config.markdownAware,
  });
  if (boundedSplitAt === null) return null;
  const firstText = trimSplitFragment(chunk.sourceProcessingText.slice(0, boundedSplitAt));
  const secondText = trimSplitFragment(chunk.sourceProcessingText.slice(boundedSplitAt));
  if (!firstText || !secondText) return null;

  const sourceFootnotes = usePipelineStore.getState().sourceFootnotes;
  const first = resetChunkForSourceEdit(
    updateChunkSourceFields(
      chunk,
      deriveChunkDisplayText(firstText, sourceFootnotes),
      firstText,
      buildChunkFootnotes(firstText, sourceFootnotes),
    ),
  );
  const second = resetChunkForSourceEdit({
    ...updateChunkSourceFields(
      chunk,
      deriveChunkDisplayText(secondText, sourceFootnotes),
      secondText,
      buildChunkFootnotes(secondText, sourceFootnotes),
    ),
    id: generateId('chunk'),
  });

  const nextChunks = [
    ...chunks.slice(0, index),
    first,
    second,
    ...chunks.slice(index + 1),
  ];
  syncProjectSourceDocument(nextChunks);
  syncSelectedChunk(nextChunks, first.id);
  return { chunks: nextChunks };
}

function syncProjectSourceDocument(chunks: TranslationChunk[]) {
  const pipeline = usePipelineStore.getState();
  const processingText = composeDocumentProcessingText(chunks);
  pipeline.setSourceDocument({
    displayText: composeDocumentDisplayText(
      processingText,
      pipeline.config.renderProfile ?? 'plain-text',
      pipeline.sourceFootnotes,
    ),
    processingText,
    sourceFootnotes: pipeline.sourceFootnotes,
    renderProfile: pipeline.config.renderProfile,
  });
}

function syncSelectedChunk(chunks: TranslationChunk[], preferredId?: string | null) {
  const ui = useUiStore.getState();
  const targetId = preferredId ?? ui.selectedChunkId;
  if (targetId && chunks.some((chunk) => chunk.id === targetId)) {
    ui.setSelectedChunkId(targetId);
    return;
  }
  ui.setSelectedChunkId(chunks[0]?.id ?? null);
}

// Keep chunkIndex in sync with any chunks structural change (add/remove/replace).
// Fires synchronously after every committed setState, covering both action-dispatched
// updates and direct setState calls in tests.
// Per-id slot replacements preserve array length and IDs, so no rebuild is needed for them.
// This subscription is intentionally never unsubscribed: the store is a module-level singleton.
useChunksStore.subscribe((state, prev) => {
  if (state.chunks.length !== prev.chunks.length) rebuildIndex(state.chunks);
});
