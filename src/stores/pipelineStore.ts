import { create } from 'zustand';
import type {
  PipelineConfig,
  PipelineStageConfig,
  ModelProvider,
  GlossaryEntry,
} from '../types';
import { DEFAULT_STAGES, DEFAULT_JUDGE_PROMPT } from '../constants';
import { generateId } from '../utils';
import { getGlossaryEntries } from '../services/glossaryService';

interface PipelineState {
  inputText: string;
  config: PipelineConfig;

  setInputText: (text: string) => void;
  setConfig: (updater: PipelineConfig | ((prev: PipelineConfig) => PipelineConfig)) => void;
  assignGlossary: (glossaryId: string | null) => Promise<void>;

  addStage: () => void;
  removeStage: (id: string) => void;
  updateStage: (id: string, updates: Partial<PipelineStageConfig>) => void;

  addGlossaryEntry: () => void;
  updateGlossaryEntry: (id: string, updates: Partial<GlossaryEntry>) => void;
  removeGlossaryEntry: (id: string) => void;
}

export const usePipelineStore = create<PipelineState>((set) => ({
  inputText: '',
  config: {
    sourceLanguage: 'English',
    targetLanguage: 'Italian',
    stages: DEFAULT_STAGES,
    judgePrompt: DEFAULT_JUDGE_PROMPT,
    judgeModel: 'gpt-4o-mini',
    judgeProvider: 'openai',
    glossary: [],
    assignedGlossaryId: null,
    useChunking: true,
    targetChunkCount: 0,
    minWords: 600,
    maxWords: 1200,
    headingAware: false,
    rollingContext: true,
    documentFormat: 'plain',
    markdownAware: false,
    experimentalImport: null,
  },

  setInputText: (text) => set({ inputText: text }),

  setConfig: (updater) =>
    set((state) => ({
      config: typeof updater === 'function' ? updater(state.config) : updater,
    })),

  assignGlossary: async (glossaryId) => {
    if (!glossaryId) {
      set((state) => ({
        config: { ...state.config, assignedGlossaryId: null, glossary: [] },
      }));
      return;
    }
    const entries = await getGlossaryEntries(glossaryId);
    set((state) => ({
      config: { ...state.config, assignedGlossaryId: glossaryId, glossary: entries },
    }));
  },

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
            model: 'gpt-4o-mini',
            provider: 'openai' as ModelProvider,
            enabled: true,
          },
        ],
      },
    })),

  removeStage: (id) =>
    set((state) => ({
      config: {
        ...state.config,
        stages: state.config.stages.filter((stage) => stage.id !== id),
      },
    })),

  updateStage: (id, updates) =>
    set((state) => ({
      config: {
        ...state.config,
        stages: state.config.stages.map((stage) =>
          stage.id === id ? { ...stage, ...updates } : stage,
        ),
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
        glossary: state.config.glossary.map((entry) =>
          entry.id === id ? { ...entry, ...updates } : entry,
        ),
      },
    })),

  removeGlossaryEntry: (id) =>
    set((state) => ({
      config: {
        ...state.config,
        glossary: state.config.glossary.filter((entry) => entry.id !== id),
      },
    })),
}));
