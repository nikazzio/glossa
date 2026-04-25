import { create } from 'zustand';
import type {
  PipelineConfig,
  PipelineStageConfig,
  TranslationChunk,
  PipelineResult,
  JudgeResult,
  ModelProvider,
  GlossaryEntry,
  ChunkStatus,
} from '../types';
import { DEFAULT_STAGES, DEFAULT_JUDGE_PROMPT } from '../constants';
import { chunkText, findBestSplitIndex, generateId, qualityDefault } from '../utils';

interface PipelineState {
  inputText: string;
  config: PipelineConfig;
  chunks: TranslationChunk[];
  isProcessing: boolean;
  cancelRequested: boolean;
  activeStreamId: string | null;
  showSettings: boolean;
  showHelp: boolean;
  ollamaModels: string[];
  ollamaStatus: 'unknown' | 'connected' | 'disconnected';

  setInputText: (text: string) => void;
  setShowSettings: (show: boolean) => void;
  setShowHelp: (show: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  requestCancel: () => void;
  clearCancelRequest: () => void;
  setActiveStreamId: (id: string | null) => void;
  setConfig: (updater: PipelineConfig | ((prev: PipelineConfig) => PipelineConfig)) => void;
  setChunks: (updater: TranslationChunk[] | ((prev: TranslationChunk[]) => TranslationChunk[])) => void;
  setOllamaModels: (models: string[]) => void;
  setOllamaStatus: (status: 'unknown' | 'connected' | 'disconnected') => void;

  // Pipeline actions
  generateChunks: () => void;
  clearChunks: () => void;
  updateChunkStage: (chunkId: string, stageId: string, result: PipelineResult) => void;
  appendChunkStageContent: (chunkId: string, stageId: string, token: string) => void;
  updateChunkJudge: (chunkId: string, result: JudgeResult) => void;
  updateChunkDraft: (chunkId: string, draft: string) => void;
  updateChunkStatus: (chunkId: string, status: ChunkStatus) => void;
  updateChunkOriginalText: (chunkId: string, text: string) => void;
  splitChunk: (chunkId: string) => void;
  mergeChunkWithNext: (chunkId: string) => void;

  // Config actions
  addStage: () => void;
  removeStage: (id: string) => void;
  updateStage: (id: string, updates: Partial<PipelineStageConfig>) => void;

  // Glossary actions
  addGlossaryEntry: () => void;
  updateGlossaryEntry: (id: string, updates: Partial<GlossaryEntry>) => void;
  removeGlossaryEntry: (id: string) => void;
}

export const usePipelineStore = create<PipelineState>((set, get) => ({
  inputText: '',
  config: {
    sourceLanguage: 'English',
    targetLanguage: 'Italian',
    stages: DEFAULT_STAGES,
    judgePrompt: DEFAULT_JUDGE_PROMPT,
    judgeModel: 'gemini-3-flash-preview',
    judgeProvider: 'gemini',
    glossary: [],
    useChunking: true,
    targetChunkCount: 0,
  },
  chunks: [],
  isProcessing: false,
  cancelRequested: false,
  activeStreamId: null,
  showSettings: false,
  showHelp: false,
  ollamaModels: [],
  ollamaStatus: 'unknown',

  setInputText: (text) => set({ inputText: text }),
  setShowSettings: (show) => {
    set({ showSettings: show, ...(show ? { showHelp: false } : {}) });
    if (show) closeProjectPanelIfOpen();
  },
  setShowHelp: (show) => {
    set({ showHelp: show, ...(show ? { showSettings: false } : {}) });
    if (show) closeProjectPanelIfOpen();
  },
  setIsProcessing: (processing) => set({ isProcessing: processing }),
  requestCancel: () => set({ cancelRequested: true }),
  clearCancelRequest: () => set({ cancelRequested: false }),
  setActiveStreamId: (id) => set({ activeStreamId: id }),
  setOllamaModels: (models) => set({ ollamaModels: models }),
  setOllamaStatus: (status) => set({ ollamaStatus: status }),

  setConfig: (updater) =>
    set((state) => ({
      config: typeof updater === 'function' ? updater(state.config) : updater,
    })),

  setChunks: (updater) =>
    set((state) => ({
      chunks: typeof updater === 'function' ? updater(state.chunks) : updater,
    })),

  generateChunks: () => {
    const { inputText, config } = get();
    if (!inputText.trim()) return;
    const texts = chunkText(inputText, {
      useChunking: config.useChunking,
      targetChunkCount: config.targetChunkCount,
    });

    const items = texts.map((text, i) => ({
      id: `chunk-${i}`,
      originalText: text,
      status: 'ready' as const,
      stageResults: {},
      judgeResult: createEmptyJudgeResult(),
      currentDraft: '',
    }));
    set({ chunks: items });
  },

  clearChunks: () => set({ chunks: [] }),

  updateChunkStage: (chunkId, stageId, result) =>
    set((state) => ({
      chunks: state.chunks.map((c) =>
        c.id === chunkId
          ? { ...c, stageResults: { ...c.stageResults, [stageId]: result } }
          : c
      ),
    })),

  appendChunkStageContent: (chunkId, stageId, token) =>
    set((state) => ({
      chunks: state.chunks.map((c) =>
        c.id === chunkId
          ? {
              ...c,
              stageResults: {
                ...c.stageResults,
                [stageId]: {
                  ...(c.stageResults[stageId] || { status: 'processing' }),
                  content: (c.stageResults[stageId]?.content || '') + token,
                },
              },
            }
          : c
      ),
    })),

  updateChunkJudge: (chunkId, result) =>
    set((state) => ({
      chunks: state.chunks.map((c) =>
        c.id === chunkId ? { ...c, judgeResult: result } : c
      ),
    })),

  updateChunkDraft: (chunkId, draft) =>
    set((state) => ({
      chunks: state.chunks.map((c) =>
        c.id === chunkId ? { ...c, currentDraft: draft } : c
      ),
    })),

  updateChunkStatus: (chunkId, status) =>
    set((state) => ({
      chunks: state.chunks.map((c) => (c.id === chunkId ? { ...c, status } : c)),
    })),

  updateChunkOriginalText: (chunkId, text) =>
    set((state) => ({
      chunks: state.chunks.map((c) =>
        c.id === chunkId ? resetChunkForSourceEdit({ ...c, originalText: text }) : c
      ),
    })),

  splitChunk: (chunkId) =>
    set((state) => {
      const index = state.chunks.findIndex((c) => c.id === chunkId);
      if (index === -1) return {};

      const chunk = state.chunks[index];
      const splitAt = findBestSplitIndex(chunk.originalText);
      if (!splitAt) return {};

      const firstText = chunk.originalText.slice(0, splitAt).trim();
      const secondText = chunk.originalText.slice(splitAt).trim();
      if (!firstText || !secondText) return {};

      const first = resetChunkForSourceEdit({ ...chunk, originalText: firstText });
      const second = resetChunkForSourceEdit({
        ...chunk,
        id: generateId('chunk'),
        originalText: secondText,
      });

      return {
        chunks: [
          ...state.chunks.slice(0, index),
          first,
          second,
          ...state.chunks.slice(index + 1),
        ],
      };
    }),

  mergeChunkWithNext: (chunkId) =>
    set((state) => {
      const index = state.chunks.findIndex((c) => c.id === chunkId);
      if (index === -1 || index >= state.chunks.length - 1) return {};

      const current = state.chunks[index];
      const next = state.chunks[index + 1];
      const merged = resetChunkForSourceEdit({
        ...current,
        originalText: `${current.originalText.trim()}\n\n${next.originalText.trim()}`,
      });

      return {
        chunks: [
          ...state.chunks.slice(0, index),
          merged,
          ...state.chunks.slice(index + 2),
        ],
      };
    }),

  addStage: () =>
    set((state) => ({
      config: {
        ...state.config,
        stages: [
          ...state.config.stages,
          {
            id: `stg-${Date.now()}`,
            name: 'New Stage',
            prompt: '',
            model: 'gemini-3-flash-preview',
            provider: 'gemini' as ModelProvider,
            enabled: true,
          },
        ],
      },
    })),

  removeStage: (id) =>
    set((state) => ({
      config: {
        ...state.config,
        stages: state.config.stages.filter((s) => s.id !== id),
      },
    })),

  updateStage: (id, updates) =>
    set((state) => ({
      config: {
        ...state.config,
        stages: state.config.stages.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      },
    })),

  addGlossaryEntry: () =>
    set((state) => ({
      config: {
        ...state.config,
        glossary: [
          ...state.config.glossary,
          { id: generateId('gloss'), term: '', translation: '' },
        ],
      },
    })),

  updateGlossaryEntry: (id, updates) =>
    set((state) => ({
      config: {
        ...state.config,
        glossary: state.config.glossary.map((g) => (g.id === id ? { ...g, ...updates } : g)),
      },
    })),

  removeGlossaryEntry: (id) =>
    set((state) => ({
      config: {
        ...state.config,
        glossary: state.config.glossary.filter((g) => g.id !== id),
      },
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

// Lazy access to avoid a circular import with projectStore.
function closeProjectPanelIfOpen() {
  void import('./projectStore').then(({ useProjectStore }) => {
    const projectStore = useProjectStore.getState();
    if (projectStore.showProjectPanel) {
      // Set directly to avoid re-triggering the cross-store close logic.
      useProjectStore.setState({ showProjectPanel: false });
    }
  });
}
