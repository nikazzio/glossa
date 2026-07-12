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
  generateId,
  qualityDefault,
} from '../utils';
import {
  buildChunkFootnotes,
  composeDocumentDisplayText,
  composeDocumentProcessingText,
  deriveChunkDisplayText,
  deriveSourceDocumentState,
  updateChunkSourceFields,
  updateChunkTranslationFields,
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

// Drop all pending tokens regardless of chunk. Used by full-store resets.
function dropAllPendingBatches(): void {
  cancelRaf();
  pendingBatch = null;
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
      targetWordsPerChunk?: number;
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
  updateChunkTranslationForce: (chunkId: string, draft: string) => void;
  toggleChunkTranslationLock: (chunkId: string) => void;
  updateChunkStatus: (chunkId: string, status: ChunkStatus) => void;
  updateChunkSourceText: (chunkId: string, text: string) => void;
  toggleChunkSourceEditing: (chunkId: string) => void;
  updateChunkCoherence: (chunkId: string, result: CoherenceResult) => void;
  toggleCoherenceIssueResolved: (chunkId: string, key: string) => void;
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
      targetWordsPerChunk: config.wordsPerChunk,
      markdownAware: config.markdownAware,
      minWords: config.minWords,
      maxWords: config.maxWords,
      headingAware: config.headingAware,
      carryTrailingShortBlocks: config.carryTrailingShortBlocks,
    }, sourceFootnotes);

    const ui = useUiStore.getState();
    ui.setViewMode(chunks.length > 1 ? 'document' : 'sandbox');
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
    // Niente auto-apertura del Chunk drawer: con la shell multibar spingerebbe il documento.
    // Il pannello Chunk si apre solo su azione esplicita (click su chunk/problema o rail).
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

  updateChunkTranslationForce: (chunkId, draft) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) =>
        updateChunkTranslationFields(chunk, draft),
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
        ...(status === 'processing'
          ? { translationStale: false, sourceEditable: false }
          : status === 'completed'
            ? { sourceEditable: false }
            : {}),
      })),
    })),

  updateChunkSourceText: (chunkId, text) =>
    set((state) => {
      const chunkIdx = chunkIndex.get(chunkId);
      if (chunkIdx === undefined) return {};
      const chunk = state.chunks[chunkIdx];
      if (!chunk || chunk.sourceDisplayText === text) return {};

      const sourceFootnotes = usePipelineStore.getState().sourceFootnotes;
      const nextChunks = updateSingleChunk(state.chunks, chunkId, (current) => {
        const hasTranslation = !!(current.translationDisplayText || Object.keys(current.stageResults).length > 0);
        const updated = updateChunkSourceFields(
          current,
          deriveChunkDisplayText(text, sourceFootnotes),
          text,
          buildChunkFootnotes(text, sourceFootnotes),
        );
        return hasTranslation ? { ...updated, translationStale: true } : updated;
      });
      syncProjectSourceDocument(nextChunks);
      return { chunks: nextChunks };
    }),

  toggleChunkSourceEditing: (chunkId) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        sourceEditable: !chunk.sourceEditable,
      })),
    })),

  updateChunkCoherence: (chunkId, result) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => ({
        ...chunk,
        coherenceResult: result,
      })),
    })),

  toggleCoherenceIssueResolved: (chunkId, key) =>
    set((state) => ({
      chunks: updateSingleChunk(state.chunks, chunkId, (chunk) => {
        const current = chunk.coherenceResult;
        if (!current) return chunk;
        const keys = current.resolvedIssueKeys ?? [];
        const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
        return { ...chunk, coherenceResult: { ...current, resolvedIssueKeys: next } };
      }),
    })),

  resetCompletedChunks: () =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.status === 'completed' ? resetChunkForSourceEdit(chunk) : chunk,
      ),
    })),

  resetAllChunks: () => {
    dropAllPendingBatches();
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.status !== 'ready' ? resetChunkForSourceEdit(chunk) : chunk,
      ),
      cancelRequested: false,
      activeStreamId: null,
    }));
  },

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
  return {
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
    translationLocked: false,
    translationStale: false,
    sourceEditable: false,
  } as T;
}

function chunksFromTexts(
  chunkTexts: string[],
  sourceFootnotes: ReturnType<typeof usePipelineStore.getState>['sourceFootnotes'],
): TranslationChunk[] {
  return chunkTexts.map((chunkTextValue) => {
    const displayText = deriveChunkDisplayText(chunkTextValue, sourceFootnotes);
    const footnotes = buildChunkFootnotes(chunkTextValue, sourceFootnotes);
    return {
      id: generateId('chunk'),
      sourceDisplayText: displayText,
      sourceProcessingText: stripFootnoteMarkers(chunkTextValue),
      translationDisplayText: '',
      translationProcessingText: '',
      status: 'ready' as const,
      stageResults: {},
      judgeResult: createEmptyJudgeResult(),
      translationLocked: false,
      sourceEditable: false,
      ...(footnotes?.length ? { footnotes } : {}),
    };
  });
}

function buildChunks(
  text: string,
  options: {
    useChunking?: boolean;
    targetWordsPerChunk?: number;
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
