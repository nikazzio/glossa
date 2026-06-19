import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { initLogger } from './utils/logger';
import { Header, PipelineSidebar } from './components/layout';
import { ErrorBoundary, ConfirmDialog, PreflightDialog, RunResumeBanner } from './components/common';
import { motion } from 'motion/react';
import { usePipeline } from './hooks/usePipeline';
import { useProjectAutosave } from './hooks/useProjectAutosave';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useUiStore } from './stores/uiStore';
import type { UiFont, DocumentFontSize, DocumentLineHeight } from './stores/uiStore';
import { useConfigStore } from './stores/configStore';
import { useProjectStore } from './stores/projectStore';
import { useLibraryStore } from './stores/libraryStore';
import { useChunksStore } from './stores/chunksStore';
import { usePipelineStore } from './stores/pipelineStore';
import { useWorkspaceStore } from './stores/workspaceStore';
import { WorkspaceWizard } from './components/workspace/WorkspaceWizard';
import { WorkspaceHome } from './components/workspace/WorkspaceHome';
import { WorkspaceSettingsModal } from './components/workspace/WorkspaceSettingsModal';
import { importTextFile } from './services/fileService';
import { savePipelineConfig } from './services/pipelineService';
import { extractFootnotes } from './utils/footnoteExtractor';
import { getContextWindow } from './models/catalog';
import { logger } from './utils/logger';
import type { DocumentFormat, DocumentRenderProfile } from './types';
import type { ImportDialogPipelineConfig } from './components/document/ImportPreviewDialog';
import { Toaster } from 'sonner';
import { toast } from 'sonner';

function HighlightColorSync() {
  const highlightColors = useUiStore((s) => s.highlightColors);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--hl-source-term-color', highlightColors.sourceTerm);
    root.style.setProperty('--hl-match-bg', highlightColors.matchTerm);
    root.style.setProperty('--hl-mismatch-bg', highlightColors.mismatchTerm);
    root.style.setProperty('--hl-search-bg', highlightColors.search);
    root.style.setProperty('--hl-audit-bg', highlightColors.auditPhrase);
    // Fallback for stores persisted before the annotation color existed.
    root.style.setProperty('--hl-annot-bg', highlightColors.annotation ?? 'rgba(58,122,114,0.25)');
  }, [highlightColors]);
  return null;
}

const UI_FONT_STACK: Record<UiFont, string> = {
  jakarta: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
  geist: '"Geist", system-ui, -apple-system, sans-serif',
  inter: '"Inter", system-ui, -apple-system, sans-serif',
  plex: '"IBM Plex Sans", system-ui, -apple-system, sans-serif',
};

function FontSync() {
  const uiFont = useUiStore((s) => s.uiFont);
  useEffect(() => {
    document.documentElement.style.setProperty('--font-sans', UI_FONT_STACK[uiFont]);
  }, [uiFont]);
  return null;
}

const DOC_FONT_SIZE_VALUES: Record<DocumentFontSize, string> = {
  sm: '0.8125rem',
  md: '0.9375rem',
  lg: '1.0625rem',
};

const DOC_LINE_HEIGHT_VALUES: Record<DocumentLineHeight, string> = {
  tight: '1.6',
  normal: '2',
  relaxed: '2.4',
};

function DocTypographySync() {
  const documentFontSize = useUiStore((s) => s.documentFontSize);
  const documentLineHeight = useUiStore((s) => s.documentLineHeight);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--doc-font-size', DOC_FONT_SIZE_VALUES[documentFontSize]);
    root.style.setProperty('--doc-line-height', DOC_LINE_HEIGHT_VALUES[documentLineHeight]);
  }, [documentFontSize, documentLineHeight]);
  return null;
}

function RunStatusAnnouncer() {
  const { t } = useTranslation();
  const runStatus = usePipelineStore((state) => state.runStatus);
  const lastRunOutcome = usePipelineStore((state) => state.lastRunOutcome);
  const [message, setMessage] = useState('');
  const previousStatusRef = useRef(runStatus);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    if (runStatus === previousStatus) return;

    if (runStatus === 'running') {
      setMessage(t('a11y.runStarted'));
    } else if (runStatus === 'completed') {
      setMessage(t('a11y.runCompleted'));
    } else if (runStatus === 'interrupted') {
      setMessage(lastRunOutcome === 'cancelled' ? t('a11y.runCancelled') : t('a11y.runFailed'));
    }

    previousStatusRef.current = runStatus;
  }, [lastRunOutcome, runStatus, t]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
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
const ProjectFlyout = lazy(() =>
  import('./components/layout').then((m) => ({ default: m.ProjectFlyout })),
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
const ImportPreviewDialog = lazy(() =>
  import('./components/document/ImportPreviewDialog').then((m) => ({ default: m.ImportPreviewDialog })),
);

interface PendingImport {
  fileName: string;
  text: string;
  rawText: string;
  useChunking: boolean;
  wordsPerChunk: number;
  headingAware: boolean;
  carryTrailingShortBlocks: boolean;
  format?: 'plain' | 'markdown';
  experimental?: 'docx-markdown';
}

/**
 * Editor view — hooks usati solo quando c'è un progetto aperto.
 * Estratto in un componente separato per evitare violazioni Rules of Hooks
 * nella shell gating di App.
 */
function EditorView() {
  const { t } = useTranslation();
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
    const mode = useConfigStore.getState().pipelineMode;
    const hasCompleted = useChunksStore.getState().chunks.some((c) => c.status === 'completed' || c.translationLocked);
    runSingleChunk(chunkId, (!hasCompleted && mode === 'test') ? 'preview' : 'completed');
  }, [runSingleChunk]);
  useProjectAutosave();
  useKeyboardShortcuts({ onRunPipeline: runPipeline, onDryRun: runDryRun });
  const viewMode = useUiStore((state) => state.viewMode);
  const setShowConfigDrawer = useUiStore((state) => state.setShowConfigDrawer);
  const showSettings = useUiStore((state) => state.showSettings);
  const chunkPresetMedium = useConfigStore((state) => state.chunkPresetMedium);
  const chunkPresetShort = useConfigStore((state) => state.chunkPresetShort);
  const chunkPresetLong = useConfigStore((state) => state.chunkPresetLong);
  const showProjectPanel = useProjectStore((state) => state.showProjectPanel);
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const activePipelineId = useProjectStore((state) => state.activePipelineId);
  const showLibraryPanel = useLibraryStore((state) => state.showLibraryPanel);
  const { config, setConfig } = usePipelineStore();
  const { loadDocument } = useChunksStore();

  const settingsLoaded = useRef(false);
  const projectPanelLoaded = useRef(false);
  const libraryPanelLoaded = useRef(false);
  if (showSettings) settingsLoaded.current = true;
  if (showProjectPanel) projectPanelLoaded.current = true;
  if (showLibraryPanel) libraryPanelLoaded.current = true;

  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);
  const editorContentKey = `editor-panel-${currentProjectId ?? 'none'}-${viewMode}`;

  const handleImportDocument = useCallback(async () => {
    try {
      const imported = await importTextFile();
      if (!imported) return;
      const isMarkdown = imported.format === 'markdown';
      const cleanText = isMarkdown ? extractFootnotes(imported.text).cleanText : imported.text;
      setPendingImport({
        fileName: imported.name,
        text: cleanText,
        rawText: imported.text,
        useChunking: config.useChunking !== false,
        wordsPerChunk: config.wordsPerChunk ?? chunkPresetMedium,
        headingAware: config.headingAware ?? true,
        carryTrailingShortBlocks: config.carryTrailingShortBlocks ?? true,
        format: imported.format,
        experimental: imported.experimental,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'pdf_no_text_layer') {
        toast.error(t('files.pdfScannedError'));
      } else {
        toast.error(t('files.importError'), { description: msg });
      }
    }
  }, [chunkPresetMedium, config, t]);

  const handleConfirmImport = useCallback(async (
    manualChunks?: string[],
    pipelineConfig?: ImportDialogPipelineConfig,
  ) => {
    if (!pendingImport) return;
    const provider = pipelineConfig?.provider ?? config.stages[0]?.provider;
    const model = pipelineConfig?.model ?? config.stages[0]?.model;
    const contextWindow = provider && model ? getContextWindow(provider, model) : undefined;
    const wordsPerChunk =
      pendingImport.wordsPerChunk > 0 ? pendingImport.wordsPerChunk : chunkPresetMedium;
    const presets = [chunkPresetShort, chunkPresetMedium, chunkPresetLong];
    const nearestPreset = presets.reduce(
      (nearest, preset) =>
        Math.abs(wordsPerChunk - preset) < Math.abs(wordsPerChunk - nearest) ? preset : nearest,
      presets[0]!,
    );
    const minWords = Math.round(nearestPreset * 0.5);
    const maxWords = Math.round(nearestPreset * 1.5);
    const updatedStages = pipelineConfig
      ? config.stages.map((stage, index) =>
          index === 0
            ? { ...stage, provider: pipelineConfig.provider, model: pipelineConfig.model }
            : stage,
        )
      : config.stages;
    const updatedConfig = {
      ...config,
      sourceLanguage: pipelineConfig?.sourceLanguage ?? config.sourceLanguage,
      targetLanguage: pipelineConfig?.targetLanguage ?? config.targetLanguage,
      stages: updatedStages,
      useChunking: pendingImport.useChunking,
      wordsPerChunk,
      minWords,
      maxWords,
      headingAware: pendingImport.headingAware,
      carryTrailingShortBlocks: pendingImport.carryTrailingShortBlocks,
      documentFormat: (pendingImport.format ?? 'plain') as DocumentFormat,
      renderProfile: (pendingImport.format === 'markdown'
        ? 'markdown'
        : 'plain-text') as DocumentRenderProfile,
      markdownAware: pendingImport.format === 'markdown',
      experimentalImport: pendingImport.experimental ?? null,
      chunkedWithContextWindow: contextWindow,
    };
    setConfig(() => updatedConfig);
    loadDocument(
      pendingImport.rawText,
      {
        useChunking: pendingImport.useChunking,
        targetWordsPerChunk: wordsPerChunk,
        markdownAware: pendingImport.format === 'markdown',
        minWords,
        maxWords,
        headingAware: pendingImport.headingAware,
        carryTrailingShortBlocks: pendingImport.carryTrailingShortBlocks,
        extractFootnotes: pendingImport.experimental === 'docx-markdown',
      },
      manualChunks,
    );
    if (activePipelineId) {
      try {
        await savePipelineConfig(activePipelineId, updatedConfig);
      } catch (err: unknown) {
        logger.error('savePipelineConfig after import failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        toast.warning(t('files.pipelineSaveAfterImportFailed'));
      }
    }
    setPendingImport(null);
    setShowConfigDrawer(false);
    toast.success(t('files.imported'));
  }, [
    activePipelineId,
    chunkPresetLong,
    chunkPresetMedium,
    chunkPresetShort,
    config,
    loadDocument,
    pendingImport,
    setConfig,
    setShowConfigDrawer,
    t,
  ]);

  return (
    <>
      {viewMode === 'document' ? (
        <Suspense fallback={null}>
          <main className="relative flex flex-1 min-h-0 overflow-hidden">
            <PipelineSidebar
              onRunPipeline={runPipeline}
              onRunAuditOnly={runAuditOnly}
              onCancelPipeline={cancelPipeline}
              onDryRun={runDryRun}
              onRetranslateChunk={handleRetranslateChunk}
              onImportDocument={handleImportDocument}
              onOpenWorkspaceSettings={() => setShowWorkspaceSettings(true)}
            />
            <ConfigDrawer
              onRunPipeline={runPipeline}
              onRunAuditOnly={runAuditOnly}
              onCancelPipeline={cancelPipeline}
            />
            <ProjectFlyout onReauditChunk={auditSingleChunk} onRunCoherenceAudit={runCoherenceAudit} />
            <div className="relative flex min-w-0 flex-1">
              <DocumentView
                onRetranslateChunk={handleRetranslateChunk}
                onImportDocument={handleImportDocument}
              />
              <PanelTransitionVeil panelKey={editorContentKey} tone="paper" variant="project" />
            </div>
          </main>
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <main className="relative grid grid-cols-1 md:grid-cols-12 flex-1 min-h-0">
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
            <PanelTransitionVeil panelKey={editorContentKey} tone="bg" variant="project" />
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
      <WorkspaceSettingsModal
        open={showWorkspaceSettings}
        onClose={() => setShowWorkspaceSettings(false)}
      />
      {pendingImport && (
        <Suspense fallback={null}>
          <ImportPreviewDialog
            fileName={pendingImport.fileName}
            text={pendingImport.text}
            useChunking={pendingImport.useChunking}
            wordsPerChunk={pendingImport.wordsPerChunk}
            headingAware={pendingImport.headingAware}
            carryTrailingShortBlocks={pendingImport.carryTrailingShortBlocks}
            markdownAware={pendingImport.format === 'markdown'}
            format={pendingImport.format}
            experimental={pendingImport.experimental}
            onUseChunkingChange={(value) =>
              setPendingImport((current) => (current ? { ...current, useChunking: value } : current))
            }
            onWordsPerChunkChange={(value) =>
              setPendingImport((current) => (current ? { ...current, wordsPerChunk: value } : current))
            }
            onHeadingAwareChange={(value) =>
              setPendingImport((current) => (current ? { ...current, headingAware: value } : current))
            }
            onCarryTrailingShortBlocksChange={(value) =>
              setPendingImport((current) => (current ? { ...current, carryTrailingShortBlocks: value } : current))
            }
            onCancel={() => setPendingImport(null)}
            onConfirm={handleConfirmImport}
          />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  useEffect(() => { void initLogger(); }, []);

  const { isLoaded, workspaces, activeWorkspace, loadWorkspaces } = useWorkspaceStore();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const isWorkspaceHome = Boolean(activeWorkspace && !currentProjectId);

  useEffect(() => {
    loadWorkspaces().catch((err: unknown) => console.error('[App] loadWorkspaces failed:', err));
  }, [loadWorkspaces]);

  // ── Shell loading ────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="flex h-dvh min-h-[var(--app-min-height)] min-w-[var(--app-min-width)] items-center justify-center bg-editorial-bg">
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

  return (
      <ErrorBoundary>
      <HighlightColorSync />
      <FontSync />
      <DocTypographySync />
      <RunStatusAnnouncer />
      <div className="flex h-dvh min-h-[var(--app-min-height)] min-w-[var(--app-min-width)] flex-col overflow-hidden bg-editorial-bg font-sans text-editorial-ink">
        <div className="flex-shrink-0">
          <Header />
        </div>
        {isWorkspaceHome ? (
          <div className="flex flex-1 min-h-0">
            <PipelineSidebar mode="dashboard" />
            <div className="relative flex min-w-0 flex-1">
              <WorkspaceHome />
              <PanelTransitionVeil
                panelKey={`workspace-home-${activeWorkspace?.id ?? 'none'}`}
                tone="paper"
                variant="workspace"
              />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <EditorView />
          </div>
        )}
        {isWorkspaceHome ? (
          <Suspense fallback={null}>
            <SettingsModal />
            <ProjectPanel />
            <LibraryPanel />
          </Suspense>
        ) : null}
        <ConfirmDialog />
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

function PanelTransitionVeil({
  panelKey,
  tone,
  variant = 'workspace',
}: {
  panelKey: string;
  tone: 'paper' | 'bg';
  variant?: 'workspace' | 'project';
}) {
  const transition =
    variant === 'project'
      ? { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }
      : { duration: 0.44, ease: [0.19, 1, 0.22, 1] as const };
  const initialOpacity = variant === 'project' ? 0.78 : 0.92;

  return (
    <motion.div
      key={panelKey}
      initial={{ opacity: initialOpacity }}
      animate={{ opacity: 0 }}
      transition={transition}
      className={`pointer-events-none absolute inset-0 z-20 ${
        tone === 'paper' ? 'bg-editorial-paper' : 'bg-editorial-bg'
      }`}
    />
  );
}
