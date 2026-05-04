import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  DocumentLayoutPreference,
  OllamaStatus,
  ViewMode,
} from '../types';

export type InsightsDrawerTab = 'index' | 'stats' | 'audit';

interface UiState {
  viewMode: ViewMode;
  documentLayout: DocumentLayoutPreference;
  selectedChunkId: string | null;
  showSettings: boolean;
  showHelp: boolean;
  showConfigDrawer: boolean;
  showInsightsDrawer: boolean;
  insightsDrawerTab: InsightsDrawerTab;
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
  setShowInsightsDrawer: (show: boolean, tab?: InsightsDrawerTab) => void;
  setInsightsDrawerTab: (tab: InsightsDrawerTab) => void;
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
  showInsightsDrawer: true,
  insightsDrawerTab: 'index',
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
      showInsightsDrawer: mode === 'document',
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
            showInsightsDrawer: false,
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
            showInsightsDrawer: false,
          }
        : { showHelp: false, showSettings: state.showSettings },
    ),
  setShowConfigDrawer: (show) =>
    set((state) =>
      show
        ? {
            showConfigDrawer: true,
            showInsightsDrawer: false,
            showSettings: false,
            showHelp: false,
          }
        : { showConfigDrawer: false },
    ),
  setShowInsightsDrawer: (show, tab) =>
    set((state) =>
      show
        ? {
            showInsightsDrawer: true,
            insightsDrawerTab: tab ?? state.insightsDrawerTab,
            showConfigDrawer: false,
            showSettings: false,
            showHelp: false,
          }
        : { showInsightsDrawer: false },
    ),
  setInsightsDrawerTab: (tab) => set({ insightsDrawerTab: tab }),
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
