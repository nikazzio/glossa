import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  DocumentLayoutPreference,
  OllamaStatus,
  ViewMode,
} from '../types';

export type InsightsDrawerTab = 'index' | 'search' | 'stats' | 'coherence' | 'glossary';
export type ChunkDrawerTab = 'audit' | 'notes' | 'operations';
export type RunPhase = 'test' | 'production';

interface UiState {
  viewMode: ViewMode;
  documentLayout: DocumentLayoutPreference;
  selectedChunkId: string | null;
  showSettings: boolean;
  showHelp: boolean;
  showConfigDrawer: boolean;
  showDocumentDrawer: boolean;
  documentDrawerTab: InsightsDrawerTab;
  showChunkDrawer: boolean;
  chunkDrawerTab: ChunkDrawerTab;
  ollamaModels: string[];
  ollamaStatus: OllamaStatus;
  highlightsEnabled: boolean;
  highlightColors: {
    sourceTerm: string;
    matchTerm: string;
    mismatchTerm: string;
    search: string;
    auditPhrase: string;
  };
  searchQuery: string;
  focusedChunkId: string | null;
  focusedIssueQuery: string | null;
  focusedIssueRequestId: number;

  traceStageId: string | null;
  setTraceStageId: (id: string | null) => void;

  pipelineMode: RunPhase;
  setPipelineMode: (mode: RunPhase) => void;
  pipelineTestChunkCount: number;
  setPipelineTestChunkCount: (count: number) => void;

  // App-level chunk preset word targets (persisted)
  chunkPresetShort: number;
  chunkPresetMedium: number;
  chunkPresetLong: number;

  // Ollama host (persisted)
  ollamaBaseUrl: string;

  // How to initialise a new pipeline (persisted)
  newPipelineInit: 'copy-first' | 'copy-previous' | 'defaults';
  setNewPipelineInit: (value: 'copy-first' | 'copy-previous' | 'defaults') => void;

  // Maximum number of pipelines allowed (persisted)
  maxPipelines: number;
  setMaxPipelines: (value: number) => void;

  setViewMode: (mode: ViewMode) => void;
  setDocumentLayout: (layout: DocumentLayoutPreference) => void;
  setSelectedChunkId: (chunkId: string | null) => void;
  setShowSettings: (show: boolean) => void;
  setShowHelp: (show: boolean) => void;
  setShowConfigDrawer: (show: boolean) => void;
  setShowDocumentDrawer: (show: boolean, tab?: InsightsDrawerTab) => void;
  setDocumentDrawerTab: (tab: InsightsDrawerTab) => void;
  setShowChunkDrawer: (show: boolean, tab?: ChunkDrawerTab) => void;
  setChunkDrawerTab: (tab: ChunkDrawerTab) => void;
  setOllamaModels: (models: string[]) => void;
  setOllamaStatus: (status: OllamaStatus) => void;
  setHighlightsEnabled: (enabled: boolean) => void;
  setHighlightColor: (type: keyof UiState['highlightColors'], color: string) => void;
  setSearchQuery: (query: string) => void;
  setFocusedChunkId: (chunkId: string | null) => void;
  focusIssueInChunk: (chunkId: string, query?: string | null) => void;
  clearFocusedIssue: () => void;
  setChunkPresetShort: (value: number) => void;
  setChunkPresetMedium: (value: number) => void;
  setChunkPresetLong: (value: number) => void;
  setOllamaBaseUrl: (url: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
  viewMode: 'document',
  documentLayout: 'auto',
  selectedChunkId: null,
  showSettings: false,
  showHelp: false,
  showConfigDrawer: false,
  showDocumentDrawer: false,
  documentDrawerTab: 'index',
  showChunkDrawer: false,
  chunkDrawerTab: 'audit',
  ollamaModels: [],
  ollamaStatus: 'unknown',
  highlightsEnabled: true,
  highlightColors: {
    sourceTerm: '#3b82f6',
    matchTerm: 'rgba(34,197,94,0.18)',
    mismatchTerm: 'rgba(239,68,68,0.15)',
    search: 'rgba(234,179,8,0.25)',
    auditPhrase: 'rgba(249,115,22,0.25)',
  },
  searchQuery: '',
  pipelineMode: 'test',
  pipelineTestChunkCount: 3,
  focusedChunkId: null,
  focusedIssueQuery: null,
  focusedIssueRequestId: 0,
  traceStageId: null,
  chunkPresetShort: 400,
  chunkPresetMedium: 700,
  chunkPresetLong: 1000,
  ollamaBaseUrl: 'http://localhost:11434',
  newPipelineInit: 'copy-first',
  maxPipelines: 5,

  setViewMode: (mode) =>
    set((state) => ({
      viewMode: mode,
      showConfigDrawer: false,
      showDocumentDrawer: mode !== 'document' ? false : state.showDocumentDrawer,
      showChunkDrawer: false,
    })),
  setDocumentLayout: (layout) => set({ documentLayout: layout }),
  setSelectedChunkId: (chunkId) => set({ selectedChunkId: chunkId }),
  setShowSettings: (show) =>
    set((state) =>
      show
        ? {
            showSettings: true,
            showHelp: false,
            showConfigDrawer: false,
            showDocumentDrawer: false,
            showChunkDrawer: false,
          }
        : { showSettings: false, showHelp: state.showHelp },
    ),
  setShowHelp: (show) =>
    set((state) =>
      show
        ? {
            showHelp: true,
            showSettings: false,
            showConfigDrawer: false,
            showDocumentDrawer: false,
            showChunkDrawer: false,
          }
        : { showHelp: false, showSettings: state.showSettings },
    ),
  setShowConfigDrawer: (show) =>
    set((state) =>
      show
        ? {
            showConfigDrawer: true,
            showDocumentDrawer: false,
            showChunkDrawer: false,
            showSettings: false,
            showHelp: false,
          }
        : { showConfigDrawer: false },
    ),
  setShowDocumentDrawer: (show, tab) =>
    set((state) =>
      show
        ? {
            showDocumentDrawer: true,
            showChunkDrawer: false,
            documentDrawerTab: tab ?? state.documentDrawerTab,
            showConfigDrawer: false,
            showSettings: false,
            showHelp: false,
          }
        : { showDocumentDrawer: false },
    ),
  setDocumentDrawerTab: (tab) => set({ documentDrawerTab: tab }),
  setShowChunkDrawer: (show, tab) =>
    set((state) =>
      show
        ? {
            showChunkDrawer: true,
            showDocumentDrawer: false,
            chunkDrawerTab: tab ?? state.chunkDrawerTab,
            showConfigDrawer: false,
            showSettings: false,
            showHelp: false,
          }
        : { showChunkDrawer: false },
    ),
  setChunkDrawerTab: (tab) => set({ chunkDrawerTab: tab }),
  setOllamaModels: (models) => set({ ollamaModels: models }),
  setOllamaStatus: (status) => set({ ollamaStatus: status }),
  setPipelineMode: (mode) => set({ pipelineMode: mode }),
  setPipelineTestChunkCount: (count) => {
    const normalized = Number.isFinite(count) ? Math.floor(count) : 1;
    set({ pipelineTestChunkCount: Math.max(1, normalized) });
  },
  setHighlightsEnabled: (enabled) => set({ highlightsEnabled: enabled }),
  setHighlightColor: (type, color) =>
    set((state) => ({ highlightColors: { ...state.highlightColors, [type]: color } })),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFocusedChunkId: (chunkId) => set({ focusedChunkId: chunkId }),
  focusIssueInChunk: (chunkId, query) =>
    set((state) => ({
      focusedChunkId: chunkId,
      focusedIssueQuery: query ?? null,
      focusedIssueRequestId: state.focusedIssueRequestId + 1,
    })),
  clearFocusedIssue: () => set({ focusedIssueQuery: null }),
  setTraceStageId: (id) => set({ traceStageId: id }),
  setChunkPresetShort: (value) => set((state) => ({ chunkPresetShort: Math.min(Math.max(50, value), state.chunkPresetMedium - 1) })),
  setChunkPresetMedium: (value) => set((state) => ({ chunkPresetMedium: Math.max(state.chunkPresetShort + 1, Math.min(value, state.chunkPresetLong - 1)) })),
  setChunkPresetLong: (value) => set((state) => ({ chunkPresetLong: Math.max(state.chunkPresetMedium + 1, Math.max(50, value)) })),
  setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),
  setNewPipelineInit: (value) => set({ newPipelineInit: value }),
  setMaxPipelines: (value) => set({ maxPipelines: Math.max(1, Math.min(20, value)) }),
    }),
    {
      name: 'glossa-ui-prefs',
      version: 3,
      migrate: (persisted: unknown, fromVersion: number) => {
        const s = persisted as Record<string, unknown>;
        if (fromVersion < 1) {
          if ('glossaryHighlightEnabled' in s) {
            s.highlightsEnabled = s.glossaryHighlightEnabled;
          }
        }
        if (fromVersion < 2) {
          const defaults: Record<string, string> = {
            sourceTerm: '#3b82f6',
            matchTerm: 'rgba(34,197,94,0.18)',
            mismatchTerm: 'rgba(239,68,68,0.15)',
            search: 'rgba(234,179,8,0.25)',
            auditPhrase: 'rgba(249,115,22,0.25)',
          };
          const existing = (s.highlightColors ?? {}) as Record<string, string>;
          s.highlightColors = { ...defaults, ...existing };
        }
        if (fromVersion < 3) {
          s.maxPipelines = 5;
        }
        return s;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        documentLayout: state.documentLayout,
        chunkPresetShort: state.chunkPresetShort,
        chunkPresetMedium: state.chunkPresetMedium,
        chunkPresetLong: state.chunkPresetLong,
        pipelineTestChunkCount: state.pipelineTestChunkCount,
        ollamaBaseUrl: state.ollamaBaseUrl,
        newPipelineInit: state.newPipelineInit,
        highlightsEnabled: state.highlightsEnabled,
        highlightColors: state.highlightColors,
        maxPipelines: state.maxPipelines,
      }),
    },
  ),
);
