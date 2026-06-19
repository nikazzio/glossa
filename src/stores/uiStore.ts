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
export type UiFont = 'jakarta' | 'geist' | 'inter' | 'plex';
export type DocumentFontSize = 'sm' | 'md' | 'lg';
export type DocumentLineHeight = 'tight' | 'normal' | 'relaxed';
export type SettingsTab = 'translations' | 'provider';
export type ProjectPanelTab = 'run' | 'pipeline' | 'document' | 'insight' | 'chunk';

/** Pannelli che vivono inline nella barra primaria (non aprono il fly-out). */
const INLINE_PROJECT_PANELS: ReadonlyArray<ProjectPanelTab> = ['run', 'pipeline', 'document'];

interface UiState {
  viewMode: ViewMode;
  documentLayout: DocumentLayoutPreference;
  documentPaneFocus: DocumentPaneFocus;
  syncScrollEnabled: boolean;
  uiFont: UiFont;
  documentFontSize: DocumentFontSize;
  documentLineHeight: DocumentLineHeight;
  selectedChunkId: string | null;
  showSettings: boolean;
  settingsTab: SettingsTab;
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
    annotation: string;
  };
  searchQuery: string;
  focusedChunkId: string | null;
  focusedIssueQuery: string | null;
  focusedSourceIssueQuery: string | null;
  focusedIssueRequestId: number;
  focusIsAnnotation: boolean;
  traceStageId: string | null;
  activePanel: ActivePanel;
  activeProjectPanel: ProjectPanelTab;
  projectContextCollapsed: boolean;
  /** Scelta esplicita dell'utente: la barra primaria deve tornare espansa alla chiusura del fly-out? */
  projectContextUserExpanded: boolean;
  dashboardSidebarCollapsed: boolean;
  dashboardSidebarWidth: number;
  projectSidebarWidth: number;
  projectFlyoutWidth: number;
  configFlyoutWidth: number;
  pendingAnnotationAnchor: { chunkId: string; text: string; content?: string } | null;

  setTraceStageId: (id: string | null) => void;
  setPendingAnnotationAnchor: (anchor: { chunkId: string; text: string; content?: string } | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setDocumentLayout: (layout: DocumentLayoutPreference) => void;
  setDocumentPaneFocus: (focus: DocumentPaneFocus) => void;
  setSyncScrollEnabled: (enabled: boolean) => void;
  setUiFont: (font: UiFont) => void;
  setDocumentFontSize: (size: DocumentFontSize) => void;
  setDocumentLineHeight: (height: DocumentLineHeight) => void;
  setSelectedChunkId: (chunkId: string | null) => void;
  setShowSettings: (show: boolean, tab?: SettingsTab) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setShowHelp: (show: boolean, section?: HelpSection) => void;
  setShowConfigDrawer: (show: boolean) => void;
  showExportDialog: boolean;
  setShowExportDialog: (show: boolean) => void;
  setShowDocumentDrawer: (show: boolean, tab?: InsightsDrawerTab) => void;
  setDocumentDrawerTab: (tab: InsightsDrawerTab) => void;
  setShowChunkDrawer: (show: boolean, tab?: ChunkDrawerTab) => void;
  setChunkDrawerTab: (tab: ChunkDrawerTab) => void;
  setHighlightsEnabled: (enabled: boolean) => void;
  setHighlightColor: (type: keyof UiState['highlightColors'], color: string) => void;
  setSearchQuery: (query: string) => void;
  setFocusedChunkId: (chunkId: string | null) => void;
  focusIssueInChunk: (chunkId: string, query?: string | null, sourceQuery?: string | null) => void;
  focusAnnotationInChunk: (chunkId: string, query: string) => void;
  clearFocusedIssue: () => void;
  clearAnnotationFocus: () => void;
  setActiveProjectPanel: (panel: ProjectPanelTab) => void;
  setProjectContextCollapsed: (collapsed: boolean) => void;
  setDashboardSidebarCollapsed: (collapsed: boolean) => void;
  setDashboardSidebarWidth: (width: number) => void;
  setProjectSidebarWidth: (width: number) => void;
  setProjectFlyoutWidth: (width: number) => void;
  setConfigFlyoutWidth: (width: number) => void;
  setActivePanel: (panel: ActivePanel, tab?: InsightsDrawerTab | ChunkDrawerTab | HelpSection | SettingsTab) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      viewMode: 'document',
      documentLayout: 'auto',
      documentPaneFocus: 'both',
      syncScrollEnabled: false,
      uiFont: 'jakarta',
      documentFontSize: 'md',
      documentLineHeight: 'normal',
      selectedChunkId: null,
      showSettings: false,
      settingsTab: 'translations',
      showHelp: false,
      helpSection: 'overview',
      showConfigDrawer: false,
      showExportDialog: false,
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
        annotation: 'rgba(58,122,114,0.25)',
      },
      searchQuery: '',
      focusedChunkId: null,
      focusedIssueQuery: null,
      focusedSourceIssueQuery: null,
      focusedIssueRequestId: 0,
      focusIsAnnotation: false,
      traceStageId: null,
      activePanel: null,
      activeProjectPanel: 'run',
      projectContextCollapsed: false,
      projectContextUserExpanded: true,
      dashboardSidebarCollapsed: false,
      dashboardSidebarWidth: 240,
      projectSidebarWidth: 240,
      projectFlyoutWidth: 430,
      configFlyoutWidth: 560,
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
      setUiFont: (font) => set({ uiFont: font }),
      setDocumentFontSize: (size) => set({ documentFontSize: size }),
      setDocumentLineHeight: (height) => set({ documentLineHeight: height }),
      setSelectedChunkId: (chunkId) =>
        set((state) => ({
          selectedChunkId: chunkId,
          ...(chunkId !== state.focusedChunkId && { focusedIssueQuery: null, focusedSourceIssueQuery: null }),
        })),
      setShowSettings: (show, tab) =>
        set((state) =>
          show
            ? {
                showSettings: true,
                settingsTab: tab ?? state.settingsTab,
                showHelp: false,
                showConfigDrawer: false,
                showDocumentDrawer: false,
                showChunkDrawer: false,
                activePanel: 'settings' as const,
              }
            : { showSettings: false, showHelp: state.showHelp, activePanel: state.showHelp ? 'help' as const : null },
        ),
      setSettingsTab: (tab) => set({ settingsTab: tab }),
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
      setShowExportDialog: (show) => set({ showExportDialog: show }),
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
                // Config esce dal fly-out della voce Pipeline: mantieni il rail su 'pipeline'.
                activeProjectPanel: 'pipeline' as const,
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
                activeProjectPanel: 'insight' as const,
                projectContextCollapsed: true,
              }
            : { showDocumentDrawer: false, activePanel: null, projectContextCollapsed: !state.projectContextUserExpanded },
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
                activeProjectPanel: 'chunk' as const,
                projectContextCollapsed: true,
              }
            : { showChunkDrawer: false, activePanel: null, projectContextCollapsed: !state.projectContextUserExpanded },
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
          focusIsAnnotation: false,
        })),
      focusAnnotationInChunk: (chunkId, query) =>
        set((state) => ({
          focusedChunkId: chunkId,
          focusedIssueQuery: query,
          focusedSourceIssueQuery: null,
          focusedIssueRequestId: state.focusedIssueRequestId + 1,
          focusIsAnnotation: true,
        })),
      clearFocusedIssue: () => set({ focusedIssueQuery: null, focusedSourceIssueQuery: null, focusIsAnnotation: false }),
      clearAnnotationFocus: () => set({ focusedIssueQuery: null, focusIsAnnotation: false }),
      setTraceStageId: (id) => set({ traceStageId: id }),
      setPendingAnnotationAnchor: (anchor) => set({ pendingAnnotationAnchor: anchor }),
      setActiveProjectPanel: (panel) =>
        set((state) => {
          if (panel === 'insight') {
            return {
              activeProjectPanel: 'insight' as const,
              showDocumentDrawer: true,
              showChunkDrawer: false,
              showConfigDrawer: false,
              activePanel: 'insights' as const,
              // Aprendo il fly-out la barra principale si riduce a icone.
              projectContextCollapsed: true,
            };
          }
          if (panel === 'chunk') {
            return {
              activeProjectPanel: 'chunk' as const,
              showChunkDrawer: true,
              showDocumentDrawer: false,
              showConfigDrawer: false,
              activePanel: 'chunk' as const,
              projectContextCollapsed: true,
            };
          }
          // run / pipeline / document → contenuto inline, fly-out chiuso.
          // Ripristina la preferenza manuale di espansione (il fly-out l'aveva forzata a collassata).
          return {
            activeProjectPanel: panel,
            showDocumentDrawer: false,
            showChunkDrawer: false,
            showConfigDrawer: false,
            projectContextCollapsed: !state.projectContextUserExpanded,
            activePanel: state.activePanel === 'insights' || state.activePanel === 'chunk' || state.activePanel === 'config' ? null : state.activePanel,
          };
        }),
      // Collassare/espandere dal rail o dal resize è una scelta esplicita: memorizzala come preferenza.
      setProjectContextCollapsed: (collapsed) =>
        set({ projectContextCollapsed: collapsed, projectContextUserExpanded: !collapsed }),
      setDashboardSidebarCollapsed: (collapsed) => set({ dashboardSidebarCollapsed: collapsed }),
      setDashboardSidebarWidth: (width) => set({ dashboardSidebarWidth: width }),
      setProjectSidebarWidth: (width) => set({ projectSidebarWidth: width }),
      setProjectFlyoutWidth: (width) => set({ projectFlyoutWidth: width }),
      setConfigFlyoutWidth: (width) => set({ configFlyoutWidth: width }),
      setActivePanel: (panel, tab) =>
        set((state) => {
          switch (panel) {
            case 'settings':
              return {
                showSettings: true, settingsTab: (tab as SettingsTab) ?? state.settingsTab,
                showHelp: false, showConfigDrawer: false,
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
      version: 12,
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
        if (fromVersion < 6) {
          // Backfill the annotation highlight colour for stores saved before it
          // existed, so the settings colour picker does not read undefined.
          const existing = (s.highlightColors ?? {}) as Record<string, string>;
          if (!existing.annotation) existing.annotation = 'rgba(58,122,114,0.25)';
          s.highlightColors = existing;
        }
        if (fromVersion < 7) {
          s.uiFont = 'jakarta';
        }
        if (fromVersion < 8) {
          s.activeProjectPanel = 'run';
          s.projectContextCollapsed = false;
        }
        if (fromVersion < 9) {
          // I pannelli fly-out (insight/chunk) non sono uno stato di rail persistibile:
          // ripristina su 'run' così la barra non resta evidenziata su un fly-out chiuso.
          if (!INLINE_PROJECT_PANELS.includes(s.activeProjectPanel as ProjectPanelTab)) {
            s.activeProjectPanel = 'run';
          }
        }
        if (fromVersion < 10) {
          s.dashboardSidebarCollapsed = false;
          s.dashboardSidebarWidth = 240;
          s.projectSidebarWidth = 240;
          s.projectFlyoutWidth = 430;
          s.configFlyoutWidth = 560;
        }
        if (fromVersion < 11) {
          // La preferenza di espansione deriva dallo stato collassato salvato.
          s.projectContextUserExpanded = !s.projectContextCollapsed;
        }
        if (fromVersion < 12) {
          s.documentFontSize = 'md';
          s.documentLineHeight = 'normal';
        }
        return s;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        documentLayout: state.documentLayout,
        documentPaneFocus: state.documentPaneFocus,
        syncScrollEnabled: state.syncScrollEnabled,
        uiFont: state.uiFont,
        documentFontSize: state.documentFontSize,
        documentLineHeight: state.documentLineHeight,
        activeProjectPanel: INLINE_PROJECT_PANELS.includes(state.activeProjectPanel)
          ? state.activeProjectPanel
          : 'run',
        projectContextCollapsed: state.projectContextCollapsed,
        projectContextUserExpanded: state.projectContextUserExpanded,
        dashboardSidebarCollapsed: state.dashboardSidebarCollapsed,
        dashboardSidebarWidth: state.dashboardSidebarWidth,
        projectSidebarWidth: state.projectSidebarWidth,
        projectFlyoutWidth: state.projectFlyoutWidth,
        configFlyoutWidth: state.configFlyoutWidth,
        highlightsEnabled: state.highlightsEnabled,
        highlightColors: state.highlightColors,
      }),
    },
  ),
);
