import { lazy, Suspense, useCallback, useEffect, useRef } from 'react';
import { initLogger } from './utils/logger';
import { Header, PipelineSidebar } from './components/layout';
import { ErrorBoundary, ConfirmDialog, PreflightDialog, RunResumeBanner } from './components/common';
import { usePipeline } from './hooks/usePipeline';
import { useProjectAutosave } from './hooks/useProjectAutosave';
import { useUiStore } from './stores/uiStore';
import { useProjectStore } from './stores/projectStore';
import { useLibraryStore } from './stores/libraryStore';
import { useChunksStore } from './stores/chunksStore';
import { useWorkspaceStore } from './stores/workspaceStore';
import { WorkspaceWizard } from './components/workspace/WorkspaceWizard';
import { WorkspaceHome } from './components/workspace/WorkspaceHome';
import { Toaster } from 'sonner';

function HighlightColorSync() {
  const highlightColors = useUiStore((s) => s.highlightColors);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--hl-source-term-color', highlightColors.sourceTerm);
    root.style.setProperty('--hl-match-bg', highlightColors.matchTerm);
    root.style.setProperty('--hl-mismatch-bg', highlightColors.mismatchTerm);
    root.style.setProperty('--hl-search-bg', highlightColors.search);
    root.style.setProperty('--hl-audit-bg', highlightColors.auditPhrase);
  }, [highlightColors]);
  return null;
}

const PipelineConfig = lazy(() =>
  import('./components/pipeline').then((m) => ({ default: m.PipelineConfig })),
);
const ProductionStream = lazy(() =>
  import('./components/pipeline').then((m) => ({ default: m.ProductionStream })),
);
const AuditPanel = lazy(() =>
  import('./components/audit').then((m) => ({ default: m.AuditPanel })),
);
const ConfigDrawer = lazy(() =>
  import('./components/document').then((m) => ({ default: m.ConfigDrawer })),
);
const DocumentView = lazy(() =>
  import('./components/document').then((m) => ({ default: m.DocumentView })),
);
const InsightsDrawer = lazy(() =>
  import('./components/document').then((m) => ({ default: m.InsightsDrawer })),
);
const SettingsModal = lazy(() =>
  import('./components/settings/SettingsModal').then((m) => ({ default: m.SettingsModal })),
);
const ProjectPanel = lazy(() =>
  import('./components/projects/ProjectPanel').then((m) => ({ default: m.ProjectPanel })),
);
const LibraryPanel = lazy(() =>
  import('./components/library/LibraryPanel').then((m) => ({ default: m.LibraryPanel })),
);

/**
 * Editor view — hooks usati solo quando c'è un progetto aperto.
 * Estratto in un componente separato per evitare violazioni Rules of Hooks
 * nella shell gating di App.
 */
function EditorView() {
  const {
    runPipeline,
    runAuditOnly,
    runSingleChunk,
    runDryRun,
    auditSingleChunk,
    runCoherenceAudit,
    cancelPipeline,
  } = usePipeline();

  const handleRetranslateChunk = useCallback((chunkId: string) => {
    const mode = useUiStore.getState().pipelineMode;
    const hasCompleted = useChunksStore.getState().chunks.some((c) => c.status === 'completed' || c.translationLocked);
    runSingleChunk(chunkId, (!hasCompleted && mode === 'test') ? 'preview' : 'completed');
  }, [runSingleChunk]);
  useProjectAutosave();
  const viewMode = useUiStore((state) => state.viewMode);
  const showSettings = useUiStore((state) => state.showSettings);
  const showProjectPanel = useProjectStore((state) => state.showProjectPanel);
  const showLibraryPanel = useLibraryStore((state) => state.showLibraryPanel);

  const settingsLoaded = useRef(false);
  const projectPanelLoaded = useRef(false);
  const libraryPanelLoaded = useRef(false);
  if (showSettings) settingsLoaded.current = true;
  if (showProjectPanel) projectPanelLoaded.current = true;
  if (showLibraryPanel) libraryPanelLoaded.current = true;

  return (
    <>
      <div className="flex-shrink-0">
        <Header
          onRunPipeline={runPipeline}
          onCancelPipeline={cancelPipeline}
        />
      </div>
      {viewMode === 'document' ? (
        <Suspense fallback={null}>
          <main className="relative flex flex-1 min-h-0 overflow-hidden">
            <PipelineSidebar
              onRunPipeline={runPipeline}
              onCancelPipeline={cancelPipeline}
              onDryRun={runDryRun}
              onRetranslateChunk={handleRetranslateChunk}
            />
            <ConfigDrawer
              onRunPipeline={runPipeline}
              onRunAuditOnly={runAuditOnly}
              onCancelPipeline={cancelPipeline}
            />
            <DocumentView
              onRetranslateChunk={handleRetranslateChunk}
            />
            <InsightsDrawer onReauditChunk={auditSingleChunk} onRunCoherenceAudit={runCoherenceAudit} />
          </main>
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <main className="grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0">
            <PipelineConfig
              onRunPipeline={runPipeline}
              onRunAuditOnly={runAuditOnly}
              onCancelPipeline={cancelPipeline}
            />
            <ProductionStream
              onRetranslateChunk={runSingleChunk}
              onReauditChunk={auditSingleChunk}
            />
            <AuditPanel
              onRunAuditOnly={runAuditOnly}
              onReauditChunk={auditSingleChunk}
            />
          </main>
        </Suspense>
      )}

      {settingsLoaded.current && (
        <Suspense fallback={null}>
          <SettingsModal />
        </Suspense>
      )}
      {projectPanelLoaded.current && (
        <Suspense fallback={null}>
          <ProjectPanel />
        </Suspense>
      )}
      {libraryPanelLoaded.current && (
        <Suspense fallback={null}>
          <LibraryPanel />
        </Suspense>
      )}

      <ConfirmDialog />
      <PreflightDialog />
      <RunResumeBanner />
    </>
  );
}

export default function App() {
  useEffect(() => { void initLogger(); }, []);

  const { isLoaded, workspaces, activeWorkspace, loadWorkspaces } = useWorkspaceStore();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  // ── Shell loading ────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-editorial-bg">
        <div className="text-sm text-editorial-muted">Caricamento...</div>
      </div>
    );
  }

  // ── First run: nessun workspace ──────────────────────────────────────
  if (workspaces.length === 0) {
    return (
      <ErrorBoundary>
        <WorkspaceWizard />
        <Toaster
          position="bottom-right"
          toastOptions={{ style: { fontFamily: 'var(--font-sans, system-ui)', fontSize: '12px' } }}
          richColors
          closeButton
        />
      </ErrorBoundary>
    );
  }

  // ── Workspace home: workspace attivo ma nessun progetto aperto ───────
  if (activeWorkspace && !currentProjectId) {
    return (
      <ErrorBoundary>
        <div className="h-screen overflow-hidden bg-editorial-bg text-editorial-ink font-sans flex flex-col">
          <div className="flex-shrink-0">
            <Header onRunPipeline={() => {}} onCancelPipeline={() => {}} />
          </div>
          <WorkspaceHome />
        </div>
        <Toaster
          position="bottom-right"
          toastOptions={{ style: { fontFamily: 'var(--font-sans, system-ui)', fontSize: '12px' } }}
          richColors
          closeButton
        />
      </ErrorBoundary>
    );
  }

  // ── Project open: mostra editor ─────────────────────────────────────
  return (
    <ErrorBoundary>
      <HighlightColorSync />
      <div className="h-screen overflow-hidden bg-editorial-bg text-editorial-ink font-sans flex flex-col">
        <EditorView />
      </div>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            fontFamily: 'var(--font-sans, system-ui)',
            fontSize: '12px',
          },
        }}
        richColors
        closeButton
      />
    </ErrorBoundary>
  );
}
