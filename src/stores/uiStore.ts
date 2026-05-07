import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  DocumentLayoutPreference,
  OllamaStatus,
  ViewMode,
} from '../types';

export type InsightsDrawerTab = 'index' | 'stats' | 'coherence';
export type ChunkDrawerTab = 'audit' | 'notes';

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
  pendingSplitChunkId: string | null;

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
  setPendingSplitChunkId: (chunkId: string | null) => void;
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
  showDocumentDrawer: true,
  documentDrawerTab: 'index',
  showChunkDrawer: false,
  chunkDrawerTab: 'audit',
  ollamaModels: [],
  ollamaStatus: 'unknown',
  glossaryHighlightEnabled: false,
  focusedChunkId: null,
  focusedIssueQuery: null,
  focusedIssueRequestId: 0,
  pendingSplitChunkId: null,

  setViewMode: (mode) =>
    set({
      viewMode: mode,
      showConfigDrawer: false,
      showDocumentDrawer: mode === 'document',
      showChunkDrawer: false,
    }),
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
  setGlossaryHighlightEnabled: (enabled) => set({ glossaryHighlightEnabled: enabled }),
  setFocusedChunkId: (chunkId) => set({ focusedChunkId: chunkId }),
  focusIssueInChunk: (chunkId, query) =>
    set((state) => ({
      focusedChunkId: chunkId,
      focusedIssueQuery: query ?? null,
      focusedIssueRequestId: state.focusedIssueRequestId + 1,
    })),
  clearFocusedIssue: () => set({ focusedIssueQuery: null }),
  setPendingSplitChunkId: (chunkId) => set({ pendingSplitChunkId: chunkId }),
    }),
    {
      name: 'glossa-ui-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ documentLayout: state.documentLayout }),
    },
  ),
);
