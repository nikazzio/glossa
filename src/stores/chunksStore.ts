import { create } from 'zustand';
import type {
  ChunkStatus,
  CoherenceResult,
  JudgeResult,
  PipelineResult,
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
      extractFootnotes?: boolean;
    },
    precomputedChunks?: string[],
  ) => void;
  clearChunks: () => void;
  updateChunkStage: (chunkId: string, stageId: string, result: PipelineResult) => void;
  appendChunkStageContent: (chunkId: string, stageId: string, token: string) => void;
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
  unlockChunkForEdit: (chunkId: string) => void;
  clearChunkStages: (chunkId: string) => void;
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
    const chunks = chunkTexts.map((chunkTextValue) => {
      const footnotes = buildChunkFootnotes(chunkTextValue, sourceDocument.footnotes);
      return withSyncedChunkFields({
        id: generateId('chunk'),
        sourceDisplayText: deriveChunkDisplayText(chunkTextValue, sourceDocument.footnotes),
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

  updateChunkStage: (chunkId, stageId, result) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId
          ? { ...chunk, stageResults: { ...chunk.stageResults, [stageId]: result } }
          : chunk,
      ),
    })),

  appendChunkStageContent: (chunkId, stageId, token) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId
          ? {
              ...chunk,
              stageResults: {
                ...chunk.stageResults,
                [stageId]: {
                  ...(chunk.stageResults[stageId] || { status: 'processing' }),
                  content: (chunk.stageResults[stageId]?.content || '') + token,
                },
              },
            }
          : chunk,
      ),
    })),

  updateChunkJudge: (chunkId, result) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId ? { ...chunk, judgeResult: result } : chunk,
      ),
    })),

  updateChunkDraft: (chunkId, draft) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId && !chunk.translationLocked
          ? updateChunkTranslationFields(chunk, draft)
          : chunk,
      ),
    })),

  toggleChunkTranslationLock: (chunkId) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId
          ? { ...chunk, translationLocked: !chunk.translationLocked }
          : chunk,
      ),
    })),

  updateChunkStatus: (chunkId, status) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId ? { ...chunk, status } : chunk,
      ),
    })),

  updateChunkOriginalText: (chunkId, text) =>
    set((state) => {
      const sourceFootnotes = usePipelineStore.getState().sourceFootnotes;
      const nextChunks = state.chunks.map((chunk) =>
        chunk.id === chunkId
          ? resetChunkForSourceEdit(
              updateChunkSourceFields(
                chunk,
                deriveChunkDisplayText(text, sourceFootnotes),
                text,
                buildChunkFootnotes(text, sourceFootnotes),
              ),
            )
          : chunk,
      );
      syncProjectSourceDocument(nextChunks);
      return { chunks: nextChunks };
    }),

  updateChunkCoherence: (chunkId, result) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId ? { ...chunk, coherenceResult: result } : chunk,
      ),
    })),

  splitChunk: (chunkId) =>
    set((state) => {
      const chunk = state.chunks.find((entry) => entry.id === chunkId);
      const splitAt = findBestSplitIndex(chunk?.sourceProcessingText ?? '', {
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
      const index = state.chunks.findIndex((chunk) => chunk.id === chunkId);
      if (index === -1 || index >= state.chunks.length - 1) return {};

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

  unlockChunkForEdit: (chunkId) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId && chunk.status === 'completed'
          ? resetChunkForSourceEdit(chunk)
          : chunk,
      ),
    })),

  clearChunkStages: (chunkId) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId ? { ...chunk, stageResults: {} } : chunk,
      ),
    })),

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
  }) as T;
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
  },
  sourceFootnotes: ReturnType<typeof usePipelineStore.getState>['sourceFootnotes'],
): TranslationChunk[] {
  return chunkText(text, options).map((chunkTextValue) => {
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

function splitChunkState(
  chunks: TranslationChunk[],
  chunkId: string,
  splitAt: number,
): { chunks: TranslationChunk[] } | null {
  const index = chunks.findIndex((chunk) => chunk.id === chunkId);
  if (index === -1) return null;

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
