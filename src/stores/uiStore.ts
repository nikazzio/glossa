import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { DocumentLayoutPreference } from '../types';
import { dashboardLocation, locationsEqual, type AppLocation } from '../navigation/appLocation';

export type InsightsDrawerTab = 'index' | 'search' | 'stats' | 'coherence' | 'glossary';
export type ChunkDrawerTab = 'summary' | 'audit' | 'notes' | 'operations' | 'memory';
export type ChunkRailTab = 'audit' | 'notes' | 'memory' | 'references' | 'promptPreview';
export type DocumentPaneFocus = 'both' | 'source' | 'translation';
export type HelpSection = 'overview' | 'pipeline' | 'features' | 'context' | 'audit' | 'projects' | 'providers' | 'ollama' | 'glossary' | 'shortcuts' | 'troubleshooting' | 'design';
export type ActivePanel = 'config' | 'insights' | 'chunk' | 'settings' | 'help' | null;
export type UiFont = 'jakarta' | 'geist' | 'inter' | 'plex';
export type DocumentFontSize = 'sm' | 'md' | 'lg';
export type ColorScheme = 'light' | 'dark' | 'system';

export const DOC_FONT_SIZE_CSS: Record<DocumentFontSize, string> = {
  sm: '0.8125rem',
  md: '0.9375rem',
  lg: '1.0625rem',
};
export type DocumentLineHeight = 'tight' | 'normal' | 'relaxed';
export type DiscoveryResultsPerRow = 3 | 4 | 'list';
export type SettingsTab = 'translations' | 'provider' | 'typography' | 'storage' | 'jobs';

export interface HLColorSet {
  sourceTerm: string;
  matchTerm: string;
  mismatchTerm: string;
  search: string;
  auditPhrase: string;
  annotation: string;
}

export const HL_COLORS_LIGHT: HLColorSet = {
  sourceTerm:   '#3b82f6',
  matchTerm:    'rgba(34,197,94,0.18)',
  mismatchTerm: 'rgba(239,68,68,0.15)',
  search:       'rgba(234,179,8,0.25)',
  auditPhrase:  'rgba(249,115,22,0.25)',
  annotation:   'rgba(58,122,114,0.25)',
};

export const HL_COLORS_DARK: HLColorSet = {
  sourceTerm:   '#60a5fa',
  matchTerm:    'rgba(74,222,128,0.22)',
  mismatchTerm: 'rgba(248,113,113,0.22)',
  search:       'rgba(250,204,21,0.30)',
  auditPhrase:  'rgba(251,146,60,0.30)',
  annotation:   'rgba(94,195,185,0.28)',
};

export const EDITORIAL_ACCENT_LIGHT = '#2F746C';
export const EDITORIAL_ACCENT_DARK = '#3A7A72';
export type ProjectPanelTab = 'run' | 'pipeline' | 'document' | 'insight' | 'chunk';

/** Pannelli che vivono inline nella barra primaria (non aprono il fly-out). */
const INLINE_PROJECT_PANELS: ReadonlyArray<ProjectPanelTab> = ['run', 'pipeline', 'document'];

interface UiState {
  documentLayout: DocumentLayoutPreference;
  documentPaneFocus: DocumentPaneFocus;
  syncScrollEnabled: boolean;
  showDeprecatedModels: boolean;
  uiFont: UiFont;
  colorScheme: ColorScheme;
  documentFontSize: DocumentFontSize;
  documentLineHeight: DocumentLineHeight;
  discoveryResultsPerRow: DiscoveryResultsPerRow;
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
  /** Shell nuova: pannello Insight destro espanso (sostituisce showDocumentDrawer || showChunkDrawer). */
  showInsightPanel: boolean;
  /** Shell nuova: tab attiva nel pannello Frammento embedded nella rail sinistra. */
  chunkRailTab: ChunkRailTab;
  /** Log operazioni (console) espanso come drawer sopra la barra di stato. */
  showConsoleDrawer: boolean;
  /**
   * Quale scheda mostra il pannello in basso (D20): i messaggi dell'app o i
   * lavori in background. Log e lavori sono le due facce della stessa domanda,
   * "cosa sta facendo il programma", quindi stanno nello stesso posto.
   */
  drawerTab: 'console' | 'jobs';
  /** Altezza in px del drawer Operazioni, ridimensionabile dall'utente (trascina il bordo superiore). */
  consoleDrawerHeight: number;
  highlightsEnabled: boolean;
  highlightColors: { light: HLColorSet; dark: HLColorSet };
  editorialAccentColor: { light: string; dark: string };
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
  pendingAnnotationAnchor: { chunkId: string; text: string; content?: string } | null;
  location: AppLocation;
  setTraceStageId: (id: string | null) => void;
  navigate: (location: AppLocation) => void;
  setPendingAnnotationAnchor: (anchor: { chunkId: string; text: string; content?: string } | null) => void;
  setDocumentLayout: (layout: DocumentLayoutPreference) => void;
  setDocumentPaneFocus: (focus: DocumentPaneFocus) => void;
  setSyncScrollEnabled: (enabled: boolean) => void;
  setShowDeprecatedModels: (show: boolean) => void;
  setUiFont: (font: UiFont) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  setDocumentFontSize: (size: DocumentFontSize) => void;
  setDocumentLineHeight: (height: DocumentLineHeight) => void;
  setDiscoveryResultsPerRow: (count: DiscoveryResultsPerRow) => void;
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
  setShowInsightPanel: (show: boolean) => void;
  setChunkRailTab: (tab: ChunkRailTab) => void;
  setShowConsoleDrawer: (show: boolean) => void;
  setDrawerTab: (tab: 'console' | 'jobs') => void;
  setConsoleDrawerHeight: (height: number) => void;
  setHighlightsEnabled: (enabled: boolean) => void;
  setHighlightColor: (mode: 'light' | 'dark', type: keyof HLColorSet, color: string) => void;
  setEditorialAccentColor: (mode: 'light' | 'dark', color: string) => void;
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
  setActivePanel: (panel: ActivePanel, tab?: InsightsDrawerTab | ChunkDrawerTab | HelpSection | SettingsTab) => void;
}

/** Esportata per test di regressione sulle migrazioni dello stato persistito. */
export function migrateUiStorePersistedState(persisted: unknown, fromVersion: number): Record<string, unknown> {
  // Un blob di localStorage corrotto o non-oggetto non deve propagarsi nelle
  // migrazioni sotto (che assumono `in`/proprietà su un oggetto): riparti dai default.
  if (typeof persisted !== 'object' || persisted === null) return {};
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
    s.projectSidebarWidth = 300;
    s.projectFlyoutWidth = 430;
  }
  if (fromVersion < 11) {
    // La preferenza di espansione deriva dallo stato collassato salvato.
    s.projectContextUserExpanded = !s.projectContextCollapsed;
  }
  if (fromVersion < 12) {
    s.documentFontSize = 'md';
    s.documentLineHeight = 'normal';
  }
  if (fromVersion < 13) {
    s.colorScheme = 'system';
  }
  if (fromVersion < 14) {
    // Migrate flat highlightColors → { light, dark } structure.
    // If the stored value is already nested (light/dark keys), leave it.
    const stored = s.highlightColors as Record<string, unknown> | undefined;
    const isNested = stored && typeof stored.light === 'object';
    if (!isNested) {
      const flat = (stored ?? {}) as Record<string, string>;
      s.highlightColors = {
        light: { ...HL_COLORS_LIGHT, ...flat },
        dark: { ...HL_COLORS_DARK },
      };
    }
  }
  if (fromVersion < 15) {
    // Riparazione: la v14 lasciava intoccato un highlightColors già "nested"
    // anche se incompleto (mancavano chiavi di tipi di evidenziazione aggiunti
    // dopo la prima migrazione), lasciandole undefined per sempre. Backfill
    // per chiave, senza perdere i colori già personalizzati dall'utente.
    const stored = (s.highlightColors ?? {}) as { light?: Record<string, string>; dark?: Record<string, string> };
    s.highlightColors = {
      light: { ...HL_COLORS_LIGHT, ...(stored.light ?? {}) },
      dark: { ...HL_COLORS_DARK, ...(stored.dark ?? {}) },
    };
  }
  if (fromVersion < 16) {
    s.editorialAccentColor = { light: EDITORIAL_ACCENT_LIGHT, dark: EDITORIAL_ACCENT_DARK };
  }
  if (fromVersion < 17) {
    s.discoveryResultsPerRow = 3;
  }
  return s;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      documentLayout: 'auto',
      documentPaneFocus: 'both',
      syncScrollEnabled: false,
      showDeprecatedModels: false,
      uiFont: 'jakarta',
      colorScheme: 'system',
      documentFontSize: 'md',
      documentLineHeight: 'normal',
      discoveryResultsPerRow: 3,
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
      showInsightPanel: false,
      chunkRailTab: 'audit',
      showConsoleDrawer: false,
      drawerTab: 'console',
      consoleDrawerHeight: 256,
      highlightsEnabled: true,
      highlightColors: { light: { ...HL_COLORS_LIGHT }, dark: { ...HL_COLORS_DARK } },
      editorialAccentColor: { light: EDITORIAL_ACCENT_LIGHT, dark: EDITORIAL_ACCENT_DARK },
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
      projectSidebarWidth: 300,
      projectFlyoutWidth: 430,
      pendingAnnotationAnchor: null,
      location: dashboardLocation(),
      setDocumentLayout: (layout) => set({ documentLayout: layout }),
      setDocumentPaneFocus: (focus) => set({ documentPaneFocus: focus }),
      setSyncScrollEnabled: (enabled) => set({ syncScrollEnabled: enabled }),
      setShowDeprecatedModels: (show) => set({ showDeprecatedModels: show }),
      setUiFont: (font) => set({ uiFont: font }),
      setColorScheme: (scheme) => set({ colorScheme: scheme }),
      setDocumentFontSize: (size) => set({ documentFontSize: size }),
      setDocumentLineHeight: (height) => set({ documentLineHeight: height }),
      setDiscoveryResultsPerRow: (count) => set({ discoveryResultsPerRow: count }),
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
      setShowInsightPanel: (show) => set({ showInsightPanel: show }),
      setChunkRailTab: (tab) => set({ chunkRailTab: tab }),
      setShowConsoleDrawer: (show) => set({ showConsoleDrawer: show }),
      setDrawerTab: (tab) => set({ drawerTab: tab }),
      setConsoleDrawerHeight: (height) => set({ consoleDrawerHeight: Math.min(520, Math.max(160, height)) }),
      setHighlightsEnabled: (enabled) => set({ highlightsEnabled: enabled }),
      setHighlightColor: (mode, type, color) =>
        set((state) => ({
          highlightColors: {
            ...state.highlightColors,
            [mode]: { ...state.highlightColors[mode], [type]: color },
          },
        })),
      setEditorialAccentColor: (mode, color) =>
        set((state) => ({
          editorialAccentColor: { ...state.editorialAccentColor, [mode]: color },
        })),
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
      navigate: (location) =>
        set((state) => (locationsEqual(state.location, location) ? state : { location })),
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
      version: 17,
      migrate: migrateUiStorePersistedState,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        documentLayout: state.documentLayout,
        documentPaneFocus: state.documentPaneFocus,
        syncScrollEnabled: state.syncScrollEnabled,
        showDeprecatedModels: state.showDeprecatedModels,
        uiFont: state.uiFont,
        colorScheme: state.colorScheme,
        documentFontSize: state.documentFontSize,
        documentLineHeight: state.documentLineHeight,
        discoveryResultsPerRow: state.discoveryResultsPerRow,
        activeProjectPanel: INLINE_PROJECT_PANELS.includes(state.activeProjectPanel)
          ? state.activeProjectPanel
          : 'run',
        projectContextCollapsed: state.projectContextCollapsed,
        projectContextUserExpanded: state.projectContextUserExpanded,
        dashboardSidebarCollapsed: state.dashboardSidebarCollapsed,
        dashboardSidebarWidth: state.dashboardSidebarWidth,
        projectSidebarWidth: state.projectSidebarWidth,
        projectFlyoutWidth: state.projectFlyoutWidth,
        consoleDrawerHeight: state.consoleDrawerHeight,
        drawerTab: state.drawerTab,
        highlightsEnabled: state.highlightsEnabled,
        highlightColors: state.highlightColors,
        editorialAccentColor: state.editorialAccentColor,
      }),
    },
  ),
);
