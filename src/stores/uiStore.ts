import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  DocumentLayoutPreference,
  OllamaStatus,
  ViewMode,
} from '../types';

export type InsightsDrawerTab = 'index' | 'stats' | 'coherence' | 'glossary';
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
  glossaryHighlightEnabled: boolean;
  focusedChunkId: string | null;
  focusedIssueQuery: string | null;
  focusedIssueRequestId: number;

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
  setGlossaryHighlightEnabled: (enabled: boolean) => void;
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
  glossaryHighlightEnabled: false,
  pipelineMode: 'test',
  pipelineTestChunkCount: 3,
  focusedChunkId: null,
  focusedIssueQuery: null,
  focusedIssueRequestId: 0,
  chunkPresetShort: 400,
  chunkPresetMedium: 700,
  chunkPresetLong: 1000,
  ollamaBaseUrl: 'http://localhost:11434',

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
  setGlossaryHighlightEnabled: (enabled) => set({ glossaryHighlightEnabled: enabled }),
  setFocusedChunkId: (chunkId) => set({ focusedChunkId: chunkId }),
  focusIssueInChunk: (chunkId, query) =>
    set((state) => ({
      focusedChunkId: chunkId,
      focusedIssueQuery: query ?? null,
      focusedIssueRequestId: state.focusedIssueRequestId + 1,
    })),
  clearFocusedIssue: () => set({ focusedIssueQuery: null }),
  setChunkPresetShort: (value) => set((state) => ({ chunkPresetShort: Math.min(Math.max(50, value), state.chunkPresetMedium - 1) })),
  setChunkPresetMedium: (value) => set((state) => ({ chunkPresetMedium: Math.max(state.chunkPresetShort + 1, Math.min(value, state.chunkPresetLong - 1)) })),
  setChunkPresetLong: (value) => set((state) => ({ chunkPresetLong: Math.max(state.chunkPresetMedium + 1, Math.max(50, value)) })),
  setOllamaBaseUrl: (url) => set({ ollamaBaseUrl: url }),
    }),
    {
      name: 'glossa-ui-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        documentLayout: state.documentLayout,
        chunkPresetShort: state.chunkPresetShort,
        chunkPresetMedium: state.chunkPresetMedium,
        chunkPresetLong: state.chunkPresetLong,
        pipelineTestChunkCount: state.pipelineTestChunkCount,
        ollamaBaseUrl: state.ollamaBaseUrl,
      }),
    },
  ),
);
