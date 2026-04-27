import { create } from 'zustand';
import type {
  ChunkStatus,
  JudgeResult,
  PipelineResult,
  TranslationChunk,
} from '../types';
import { usePipelineStore } from './pipelineStore';
import { useUiStore } from './uiStore';
import { chunkText, findBestSplitIndex, generateId, qualityDefault } from '../utils';

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
    },
  ) => void;
  clearChunks: () => void;
  updateChunkStage: (chunkId: string, stageId: string, result: PipelineResult) => void;
  appendChunkStageContent: (chunkId: string, stageId: string, token: string) => void;
  updateChunkJudge: (chunkId: string, result: JudgeResult) => void;
  updateChunkDraft: (chunkId: string, draft: string) => void;
  updateChunkStatus: (chunkId: string, status: ChunkStatus) => void;
  updateChunkOriginalText: (chunkId: string, text: string) => void;
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
    const { inputText, config } = usePipelineStore.getState();
    if (!inputText.trim()) return;

    const chunks = buildChunks(inputText, {
      useChunking: config.useChunking,
      targetChunkCount: config.targetChunkCount,
    });

    useUiStore.getState().setViewMode(chunks.length > 1 ? 'document' : 'sandbox');
    syncSelectedChunk(chunks);
    set({ chunks });
  },

  loadDocument: (text, options = {}) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const chunks = buildChunks(trimmed, options);
    usePipelineStore.getState().setInputText(trimmed);
    useUiStore.getState().setViewMode('document');
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
        chunk.id === chunkId ? { ...chunk, currentDraft: draft } : chunk,
      ),
    })),

  updateChunkStatus: (chunkId, status) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId ? { ...chunk, status } : chunk,
      ),
    })),

  updateChunkOriginalText: (chunkId, text) =>
    set((state) => ({
      chunks: state.chunks.map((chunk) =>
        chunk.id === chunkId
          ? resetChunkForSourceEdit({ ...chunk, originalText: text })
          : chunk,
      ),
    })),

  splitChunk: (chunkId) =>
    set((state) => {
      const chunk = state.chunks.find((entry) => entry.id === chunkId);
      const splitAt = findBestSplitIndex(chunk?.originalText ?? '');
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

      const merged = resetChunkForSourceEdit({
        ...current,
        originalText: `${current.originalText.trim()}\n\n${next.originalText.trim()}`,
      });

      const chunks = [
        ...state.chunks.slice(0, index),
        merged,
        ...state.chunks.slice(index + 2),
      ];
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
  return {
    ...chunk,
    status: 'ready',
    stageResults: {},
    judgeResult: createEmptyJudgeResult(),
    currentDraft: '',
  };
}

function buildChunks(
  text: string,
  options: {
    useChunking?: boolean;
    targetChunkCount?: number;
  },
): TranslationChunk[] {
  return chunkText(text, options).map((chunkTextValue, index) => ({
    id: `chunk-${index}`,
    originalText: chunkTextValue,
    status: 'ready' as const,
    stageResults: {},
    judgeResult: createEmptyJudgeResult(),
    currentDraft: '',
  }));
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

  const boundedSplitAt = Math.max(1, Math.min(splitAt, chunk.originalText.length - 1));
  const firstText = chunk.originalText.slice(0, boundedSplitAt).trim();
  const secondText = chunk.originalText.slice(boundedSplitAt).trim();
  if (!firstText || !secondText) return null;

  const first = resetChunkForSourceEdit({ ...chunk, originalText: firstText });
  const second = resetChunkForSourceEdit({
    ...chunk,
    id: generateId('chunk'),
    originalText: secondText,
  });

  const nextChunks = [
    ...chunks.slice(0, index),
    first,
    second,
    ...chunks.slice(index + 1),
  ];
  syncSelectedChunk(nextChunks, first.id);
  return { chunks: nextChunks };
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
