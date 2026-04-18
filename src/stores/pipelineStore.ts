import { create } from 'zustand';
import type {
  PipelineConfig,
  PipelineStageConfig,
  TranslationChunk,
  PipelineResult,
  JudgeResult,
  ModelProvider,
} from '../types';
import { DEFAULT_STAGES, DEFAULT_JUDGE_PROMPT } from '../constants';

interface PipelineState {
  inputText: string;
  config: PipelineConfig;
  chunks: TranslationChunk[];
  isProcessing: boolean;
  showSettings: boolean;
  ollamaModels: string[];
  ollamaStatus: 'unknown' | 'connected' | 'disconnected';

  setInputText: (text: string) => void;
  setShowSettings: (show: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
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

  // Config actions
  addStage: () => void;
  removeStage: (id: string) => void;
  updateStage: (id: string, updates: Partial<PipelineStageConfig>) => void;
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
  },
  chunks: [],
  isProcessing: false,
  showSettings: false,
  ollamaModels: [],
  ollamaStatus: 'unknown',

  setInputText: (text) => set({ inputText: text }),
  setShowSettings: (show) => set({ showSettings: show }),
  setIsProcessing: (processing) => set({ isProcessing: processing }),
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
    const texts = config.useChunking !== false
      ? inputText.split('\n\n').filter((p) => p.trim())
      : [inputText.trim()].filter(Boolean);

    const items = texts.map((text, i) => ({
      id: `chunk-${i}`,
      originalText: text,
      stageResults: {},
      judgeResult: { content: '', status: 'idle' as const, score: 0, issues: [] },
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
}));
