import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  DocumentLayoutPreference,
  ViewMode,
} from '../types';

export type { RunPhase } from './configStore';
export type InsightsDrawerTab = 'index' | 'search' | 'stats' | 'coherence' | 'glossary';
export type ChunkDrawerTab = 'summary' | 'audit' | 'notes' | 'operations' | 'memory';
export type DocumentPaneFocus = 'both' | 'source' | 'translation';
export type HelpSection = 'overview' | 'pipeline' | 'features' | 'context' | 'audit' | 'projects' | 'providers' | 'ollama' | 'glossary' | 'shortcuts' | 'troubleshooting' | 'design';
export type ActivePanel = 'config' | 'insights' | 'chunk' | 'settings' | 'help' | null;

interface UiState {
  viewMode: ViewMode;
  documentLayout: DocumentLayoutPreference;
  documentPaneFocus: DocumentPaneFocus;
  syncScrollEnabled: boolean;
  selectedChunkId: string | null;
  showSettings: boolean;
  showHelp: boolean;
  helpSection: HelpSection;
  showConfigDrawer: boolean;
  showDocumentDrawer: boolean;
  documentDrawerTab: InsightsDrawerTab;
  showChunkDrawer: boolean;
  chunkDrawerTab: ChunkDrawerTab;
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
  focusedSourceIssueQuery: string | null;
  focusedIssueRequestId: number;
  traceStageId: string | null;
  activePanel: ActivePanel;
  pendingAnnotationAnchor: { chunkId: string; text: string } | null;

  setTraceStageId: (id: string | null) => void;
  setPendingAnnotationAnchor: (anchor: { chunkId: string; text: string } | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setDocumentLayout: (layout: DocumentLayoutPreference) => void;
  setDocumentPaneFocus: (focus: DocumentPaneFocus) => void;
  setSyncScrollEnabled: (enabled: boolean) => void;
  setSelectedChunkId: (chunkId: string | null) => void;
  setShowSettings: (show: boolean) => void;
  setShowHelp: (show: boolean, section?: HelpSection) => void;
  setShowConfigDrawer: (show: boolean) => void;
  setShowDocumentDrawer: (show: boolean, tab?: InsightsDrawerTab) => void;
  setDocumentDrawerTab: (tab: InsightsDrawerTab) => void;
  setShowChunkDrawer: (show: boolean, tab?: ChunkDrawerTab) => void;
  setChunkDrawerTab: (tab: ChunkDrawerTab) => void;
  setHighlightsEnabled: (enabled: boolean) => void;
  setHighlightColor: (type: keyof UiState['highlightColors'], color: string) => void;
  setSearchQuery: (query: string) => void;
  setFocusedChunkId: (chunkId: string | null) => void;
  focusIssueInChunk: (chunkId: string, query?: string | null, sourceQuery?: string | null) => void;
  clearFocusedIssue: () => void;
  setActivePanel: (panel: ActivePanel, tab?: InsightsDrawerTab | ChunkDrawerTab | HelpSection) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      viewMode: 'document',
      documentLayout: 'auto',
      documentPaneFocus: 'both',
      syncScrollEnabled: false,
      selectedChunkId: null,
      showSettings: false,
      showHelp: false,
      helpSection: 'overview',
      showConfigDrawer: false,
      showDocumentDrawer: false,
      documentDrawerTab: 'index',
      showChunkDrawer: false,
      chunkDrawerTab: 'summary',
      highlightsEnabled: true,
      highlightColors: {
        sourceTerm: '#3b82f6',
        matchTerm: 'rgba(34,197,94,0.18)',
        mismatchTerm: 'rgba(239,68,68,0.15)',
        search: 'rgba(234,179,8,0.25)',
        auditPhrase: 'rgba(249,115,22,0.25)',
      },
      searchQuery: '',
      focusedChunkId: null,
      focusedIssueQuery: null,
      focusedSourceIssueQuery: null,
      focusedIssueRequestId: 0,
      traceStageId: null,
      activePanel: null,
      pendingAnnotationAnchor: null,

      setViewMode: (mode) =>
        set((state) => ({
          viewMode: mode,
          showConfigDrawer: false,
          showDocumentDrawer: mode !== 'document' ? false : state.showDocumentDrawer,
          showChunkDrawer: false,
          activePanel: mode !== 'document'
            ? null
            : state.activePanel === 'chunk' ? null : state.activePanel,
        })),
      setDocumentLayout: (layout) => set({ documentLayout: layout }),
      setDocumentPaneFocus: (focus) => set({ documentPaneFocus: focus }),
      setSyncScrollEnabled: (enabled) => set({ syncScrollEnabled: enabled }),
      setSelectedChunkId: (chunkId) =>
        set((state) => ({
          selectedChunkId: chunkId,
          ...(chunkId !== state.focusedChunkId && { focusedIssueQuery: null, focusedSourceIssueQuery: null }),
        })),
      setShowSettings: (show) =>
        set((state) =>
          show
            ? {
                showSettings: true,
                showHelp: false,
                showConfigDrawer: false,
                showDocumentDrawer: false,
                showChunkDrawer: false,
                activePanel: 'settings' as const,
              }
            : { showSettings: false, showHelp: state.showHelp, activePanel: state.showHelp ? 'help' as const : null },
        ),
      setShowHelp: (show, section) =>
        set((state) =>
          show
            ? {
                showHelp: true,
                helpSection: section ?? 'overview',
                showSettings: false,
                showConfigDrawer: false,
                showDocumentDrawer: false,
                showChunkDrawer: false,
                activePanel: 'help' as const,
              }
            : { showHelp: false, showSettings: state.showSettings, activePanel: state.showSettings ? 'settings' as const : null },
        ),
      setShowConfigDrawer: (show) =>
        set(() =>
          show
            ? {
                showConfigDrawer: true,
                showDocumentDrawer: false,
                showChunkDrawer: false,
                showSettings: false,
                showHelp: false,
                activePanel: 'config' as const,
              }
            : { showConfigDrawer: false, activePanel: null },
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
                activePanel: 'insights' as const,
              }
            : { showDocumentDrawer: false, activePanel: null },
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
                activePanel: 'chunk' as const,
              }
            : { showChunkDrawer: false, activePanel: null },
        ),
      setChunkDrawerTab: (tab) => set({ chunkDrawerTab: tab }),
      setHighlightsEnabled: (enabled) => set({ highlightsEnabled: enabled }),
      setHighlightColor: (type, color) =>
        set((state) => ({ highlightColors: { ...state.highlightColors, [type]: color } })),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setFocusedChunkId: (chunkId) => set({ focusedChunkId: chunkId }),
      focusIssueInChunk: (chunkId, query, sourceQuery) =>
        set((state) => ({
          focusedChunkId: chunkId,
          focusedIssueQuery: query ?? null,
          focusedSourceIssueQuery: sourceQuery ?? null,
          focusedIssueRequestId: state.focusedIssueRequestId + 1,
        })),
      clearFocusedIssue: () => set({ focusedIssueQuery: null, focusedSourceIssueQuery: null }),
      setTraceStageId: (id) => set({ traceStageId: id }),
      setPendingAnnotationAnchor: (anchor) => set({ pendingAnnotationAnchor: anchor }),
      setActivePanel: (panel, tab) =>
        set((state) => {
          switch (panel) {
            case 'settings':
              return {
                showSettings: true, showHelp: false, showConfigDrawer: false,
                showDocumentDrawer: false, showChunkDrawer: false, activePanel: 'settings' as const,
              };
            case 'help':
              return {
                showHelp: true, helpSection: (tab as HelpSection) ?? 'overview',
                showSettings: false, showConfigDrawer: false,
                showDocumentDrawer: false, showChunkDrawer: false, activePanel: 'help' as const,
              };
            case 'config':
              return {
                showConfigDrawer: true, showDocumentDrawer: false, showChunkDrawer: false,
                showSettings: false, showHelp: false, activePanel: 'config' as const,
              };
            case 'insights':
              return {
                showDocumentDrawer: true,
                documentDrawerTab: (tab as InsightsDrawerTab) ?? state.documentDrawerTab,
                showChunkDrawer: false, showConfigDrawer: false,
                showSettings: false, showHelp: false, activePanel: 'insights' as const,
              };
            case 'chunk':
              return {
                showChunkDrawer: true,
                chunkDrawerTab: (tab as ChunkDrawerTab) ?? state.chunkDrawerTab,
                showDocumentDrawer: false, showConfigDrawer: false,
                showSettings: false, showHelp: false, activePanel: 'chunk' as const,
              };
            case null:
              return {
                showSettings: false, showHelp: false, showConfigDrawer: false,
                showDocumentDrawer: false, showChunkDrawer: false, activePanel: null,
              };
          }
        }),
    }),
    {
      name: 'glossa-ui-prefs',
      version: 5,
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
        if (fromVersion < 4) {
          s.documentPaneFocus = 'both';
          s.syncScrollEnabled = false;
        }
        return s;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        documentLayout: state.documentLayout,
        documentPaneFocus: state.documentPaneFocus,
        syncScrollEnabled: state.syncScrollEnabled,
        highlightsEnabled: state.highlightsEnabled,
        highlightColors: state.highlightColors,
      }),
    },
  ),
);
