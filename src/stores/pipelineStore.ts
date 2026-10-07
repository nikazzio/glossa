import { create } from 'zustand';
import type {
  PipelineConfig,
  PipelineMode,
  PipelineRunStatus,
  PipelineStageConfig,
  ModelProvider,
  WorkLanguages,
} from '../types';
import { DEFAULT_STAGES, DEFAULT_JUDGE_PROMPT, DEFAULT_COHERENCE_PROMPT, DEFAULT_WORK_BRIEF, DEFAULT_WORK_LANGUAGES } from '../constants';
import { buildStagesForMode } from '../pipeline/pipelineModes';
import { getGlossaryEntries } from '../services/glossaryService';
import { useWorkspaceStore } from './workspaceStore';
import type { FootnoteDefinition } from '../types';
import { deriveSourceDocumentState } from '../utils/documentState';

interface PipelineState {
  runStatus: PipelineRunStatus;
  lastRunOutcome: 'completed' | 'cancelled' | 'error' | null;
  lastRunConfig: string | null;
  inputText: string;
  inputProcessingText: string;
  sourceFootnotes: FootnoteDefinition[];
  /** Lingue dell'opera aperta: stanno sull'opera, valgono per tutte le sue pipeline. */
  workLanguages: WorkLanguages;
  config: PipelineConfig;

  setInputText: (text: string) => void;
  setSourceDocument: (input: {
    displayText: string;
    processingText?: string;
    sourceFootnotes?: FootnoteDefinition[];
    renderProfile?: PipelineConfig['renderProfile'];
  }) => void;
  setWorkLanguages: (languages: WorkLanguages) => void;
  setConfig: (updater: PipelineConfig | ((prev: PipelineConfig) => PipelineConfig)) => void;
  setMode: (mode: PipelineMode) => void;
  assignGlossary: (glossaryId: string | null) => Promise<void>;
  resetToDefaults: () => void;

  addStage: () => void;
  removeStage: (id: string) => void;
  updateStage: (id: string, updates: Partial<PipelineStageConfig>) => void;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  pipelineId: '',
  mode: 'standard',
  stages: buildStagesForMode('standard', DEFAULT_STAGES),
  judgePrompt: DEFAULT_JUDGE_PROMPT,
  judgeModel: 'gpt-5.6-terra',
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
  workBrief: DEFAULT_WORK_BRIEF,
  reviewProviderOptions: undefined,
  usePhraseMemory: false,
  autoSearchPhraseMemory: true,
  phraseMemorySimilarityThreshold: 0.75,
  phraseMemoryMaxResults: 10,
};

export const usePipelineStore = create<PipelineState>((set) => ({
  runStatus: 'idle',
  lastRunOutcome: null,
  lastRunConfig: null,
  inputText: '',
  inputProcessingText: '',
  sourceFootnotes: [],
  workLanguages: DEFAULT_WORK_LANGUAGES,
  config: { ...DEFAULT_PIPELINE_CONFIG, stages: buildStagesForMode('standard', DEFAULT_STAGES) },

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

  setWorkLanguages: (languages) => set({ workLanguages: languages }),

  setConfig: (updater) =>
    set((state) => {
      const nextConfig = typeof updater === 'function' ? updater(state.config) : updater;
      const nextDocument = deriveSourceDocumentState(state.inputText, nextConfig);
      return {
        config: {
          ...nextConfig,
          pipelineId: state.config.pipelineId,
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
      lastRunOutcome: null,
      lastRunConfig: null,
      inputText: '',
      inputProcessingText: '',
      sourceFootnotes: [],
      workLanguages: DEFAULT_WORK_LANGUAGES,
      config: { ...DEFAULT_PIPELINE_CONFIG, stages: buildStagesForMode('standard', DEFAULT_STAGES) },
    }),

  assignGlossary: async (glossaryId) => {
    if (!glossaryId) {
      set((state) => ({
        config: { ...state.config, assignedGlossaryId: null, glossary: [] },
      }));
      return;
    }
    // Il glossario che finisce nel prompt è quello **come lo vede questo
    // workspace**: se una voce è stata corretta qui, la traduzione usa la
    // correzione — è il motivo per cui le correzioni esistono (#213).
    const entries = await getGlossaryEntries(
      glossaryId,
      useWorkspaceStore.getState().activeWorkspace?.id ?? null,
    );
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
            model: 'gpt-5.4-nano',
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
