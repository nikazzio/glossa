import { create } from 'zustand';
import type {
  PipelineConfig,
  PipelineMode,
  PipelineRunStatus,
  PipelineStageConfig,
  ModelProvider,
} from '../types';
import { DEFAULT_STAGES, DEFAULT_JUDGE_PROMPT, DEFAULT_COHERENCE_PROMPT } from '../constants';
import { buildStagesForMode } from '../pipeline/pipelineModes';
import { getGlossaryEntries } from '../services/glossaryService';
import type { FootnoteDefinition } from '../types';
import { deriveSourceDocumentState } from '../utils/documentState';

interface PipelineState {
  runStatus: PipelineRunStatus;
  lastRunConfig: string | null;
  inputText: string;
  inputProcessingText: string;
  sourceFootnotes: FootnoteDefinition[];
  config: PipelineConfig;

  setInputText: (text: string) => void;
  setSourceDocument: (input: {
    displayText: string;
    processingText?: string;
    sourceFootnotes?: FootnoteDefinition[];
    renderProfile?: PipelineConfig['renderProfile'];
  }) => void;
  setConfig: (updater: PipelineConfig | ((prev: PipelineConfig) => PipelineConfig)) => void;
  setMode: (mode: PipelineMode) => void;
  assignGlossary: (glossaryId: string | null) => Promise<void>;
  resetToDefaults: () => void;

  addStage: () => void;
  removeStage: (id: string) => void;
  updateStage: (id: string, updates: Partial<PipelineStageConfig>) => void;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  sourceLanguage: 'English',
  targetLanguage: 'Italian',
  mode: 'standard',
  stages: DEFAULT_STAGES,
  judgePrompt: DEFAULT_JUDGE_PROMPT,
  judgeModel: 'gpt-5.4-mini',
  judgeProvider: 'openai',
  glossary: [],
  assignedGlossaryId: null,
  useChunking: true,
  wordsPerChunk: 0,
  minWords: 600,
  maxWords: 1200,
  headingAware: true,
  carryTrailingShortBlocks: true,
  documentFormat: 'plain',
  renderProfile: 'plain-text',
  markdownAware: false,
  experimentalImport: null,
  coherencePrompt: DEFAULT_COHERENCE_PROMPT,
  reviewProviderOptions: undefined,
};

export const usePipelineStore = create<PipelineState>((set) => ({
  runStatus: 'idle',
  lastRunConfig: null,
  inputText: '',
  inputProcessingText: '',
  sourceFootnotes: [],
  config: { ...DEFAULT_PIPELINE_CONFIG, stages: DEFAULT_STAGES },

  setInputText: (text) =>
    set((state) => {
      const next = deriveSourceDocumentState(text, state.config);
      return {
        inputText: next.displayText,
        inputProcessingText: next.processingText,
        sourceFootnotes: next.footnotes,
        config: { ...state.config, renderProfile: next.renderProfile },
      };
    }),

  setSourceDocument: ({ displayText, processingText, sourceFootnotes, renderProfile }) =>
    set((state) => ({
      inputText: displayText,
      inputProcessingText: processingText ?? displayText,
      sourceFootnotes: sourceFootnotes ?? [],
      config: {
        ...state.config,
        renderProfile: renderProfile ?? state.config.renderProfile,
      },
    })),

  setConfig: (updater) =>
    set((state) => {
      const nextConfig = typeof updater === 'function' ? updater(state.config) : updater;
      const nextDocument = deriveSourceDocumentState(state.inputText, nextConfig);
      return {
        config: {
          ...nextConfig,
          renderProfile: nextConfig.renderProfile ?? nextDocument.renderProfile,
        },
        inputProcessingText: nextDocument.processingText,
        sourceFootnotes: nextDocument.footnotes,
      };
    }),

  setMode: (mode) =>
    set((state) => ({
      config: {
        ...state.config,
        mode,
        stages: buildStagesForMode(mode, state.config.stages),
      },
    })),

  resetToDefaults: () =>
    set({
      runStatus: 'idle',
      lastRunConfig: null,
      inputText: '',
      inputProcessingText: '',
      sourceFootnotes: [],
      config: { ...DEFAULT_PIPELINE_CONFIG, stages: DEFAULT_STAGES },
    }),

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
            role: 'translation' as const,
            prompt: '',
            model: 'gpt-5-nano',
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
}));
