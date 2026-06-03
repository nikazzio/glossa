import {
  ChevronLeft,
  Columns2,
  FileOutput,
  FlaskConical,
  FolderOpen,
  Highlighter,
  Info,
  LibraryBig,
  Link2,
  Link2Off,
  Loader2,
  Minus,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  RotateCcw,
  Save,
  Settings2,
  Square,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { usePricingStore } from '../../stores/pricingStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { CostBreakdownPanel } from '../pipeline/CostBadge';
import { IconButton, Tooltip } from '../ui';
import { importTextFile, exportTranslation, exportBilingual } from '../../services/fileService';
import { savePipelineConfig } from '../../services/pipelineService';
import { extractFootnotes } from '../../utils/footnoteExtractor';
import { logger } from '../../utils/logger';
import { getContextWindow } from '../../models/catalog';
import type { ImportDialogPipelineConfig } from '../document/ImportPreviewDialog';
import type { ExportFormat } from '../document/ExportDialog';
import { DashboardSidebar } from './DashboardSidebar';
import type { DocumentFormat, DocumentRenderProfile } from '../../types';

const ExportDialog = lazy(() =>
  import('../document/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);
const ImportPreviewDialog = lazy(() =>
  import('../document/ImportPreviewDialog').then((m) => ({ default: m.ImportPreviewDialog })),
);
const SaveProjectDialog = lazy(() =>
  import('../projects/SaveProjectDialog').then((m) => ({ default: m.SaveProjectDialog })),
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
interface PipelineSidebarProps {
  mode?: 'dashboard' | 'editor';
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
}

const LANG_CODES: Record<string, string> = {
  Italian: 'IT', English: 'EN', Spanish: 'ES', French: 'FR',
  German: 'DE', Portuguese: 'PT', Japanese: 'JA', Chinese: 'ZH',
  Korean: 'KO', Russian: 'RU',
};
const langCode = (name: string) => LANG_CODES[name] ?? name.slice(0, 2).toUpperCase();

export function PipelineSidebar({
  mode = 'editor',
  onRunPipeline,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
}: PipelineSidebarProps) {
  const { t } = useTranslation();

  // ── Stores — all hooks before any conditional return ─────────────
  const { config, setConfig } = usePipelineStore();
  const runStatus = usePipelineStore((s) => s.runStatus);
  const {
    pipelines,
    activePipelineId,
    currentProjectId,
    switchPipeline,
    createNewPipeline,
    deletePipeline,
    setShowProjectPanel,
    saveCurrentProject,
    closeProject,
    loadProjects,
  } = useProjectStore();
  const { chunks, isProcessing, cancelRequested, loadDocument } = useChunksStore();
  const {
    pipelineMode,
    setPipelineMode,
    pipelineTestChunkCount,
    setPipelineTestChunkCount,
    showConfigDrawer,
    setShowConfigDrawer,
    selectedChunkId,
    maxPipelines,
    documentPaneFocus,
    setDocumentPaneFocus,
    syncScrollEnabled,
    setSyncScrollEnabled,
    highlightsEnabled,
    setHighlightsEnabled,
    chunkPresetShort,
    chunkPresetMedium,
    chunkPresetLong,
  } = useUiStore();
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const { activeWorkspace } = useWorkspaceStore();

  // ── Local state ───────────────────────────────────────────────────
  const [showCostPanel, setShowCostPanel] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [showSaveProjectDialog, setShowSaveProjectDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [isCreatingProjectFromSave, setIsCreatingProjectFromSave] = useState(false);
  const saveDialogLoaded = useRef(false);
  if (showSaveProjectDialog) saveDialogLoaded.current = true;

  // ── Derived ───────────────────────────────────────────────────────
  const isRunning = runStatus === 'running';
  const hasProject = !!currentProjectId;
  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;
  const runChunkCount =
    pipelineMode === 'test'
      ? Math.max(1, Math.min(pipelineTestChunkCount, chunks.length || 1))
      : chunks.length;
  const testControlsDisabled = isProcessing || pipelineMode !== 'test';
  const syncScrollDisabled = documentPaneFocus !== 'both';
  const foundIndex = chunks.findIndex((c) => c.id === selectedChunkId);
  const currentIndex = foundIndex >= 0 ? foundIndex : 0;
  const currentChunk = selectedChunkId && foundIndex >= 0 ? chunks[currentIndex] ?? null : null;
  const completedCount = chunks.filter(
    (c) => c.status === 'completed' || c.status === 'preview',
  ).length;
  const costEstimate = useMemo(
    () => estimatePipelineCost(chunks, config, pricingOverrides),
    [chunks, config, pricingOverrides],
  );

  // ── Pipeline delete ───────────────────────────────────────────────
  const handleDeletePipeline = async (pipelineId: string, pipelineName: string) => {
    const ok = await confirm({
      title: t('pipeline.confirmDeleteTitle'),
      message: t('pipeline.confirmDeleteMessage', { name: pipelineName }),
      confirmLabel: t('pipeline.deletePipeline'),
      danger: true,
    });
    if (!ok) return;
    await deletePipeline(pipelineId);
  };

  // ── Doc action handlers ───────────────────────────────────────────
  const handleImport = async () => {
    try {
      const imported = await importTextFile();
      if (imported) {
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
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'pdf_no_text_layer') {
        toast.error(t('files.pdfScannedError'));
      } else {
        toast.error(t('files.importError'), { description: msg });
      }
    }
  };

  const handleConfirmImport = async (
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
      (nearest, p) =>
        Math.abs(wordsPerChunk - p) < Math.abs(wordsPerChunk - nearest) ? p : nearest,
      presets[0]!,
    );
    const minWords = Math.round(nearestPreset * 0.5);
    const maxWords = Math.round(nearestPreset * 1.5);
    const updatedStages = pipelineConfig
      ? config.stages.map((s, i) =>
          i === 0
            ? { ...s, provider: pipelineConfig.provider, model: pipelineConfig.model }
            : s,
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
    toast.success(t('files.imported'));
  };

  const handleSave = async () => {
    if (!currentProjectId) {
      setShowSaveProjectDialog(true);
      return;
    }
    try {
      await saveCurrentProject();
      toast.success(t('projects.saved'));
    } catch (err: unknown) {
      toast.error(t('projects.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleFirstSave = async (name: string) => {
    try {
      setIsCreatingProjectFromSave(true);
      await saveCurrentProject(name);
      setShowSaveProjectDialog(false);
      toast.success(t('projects.saved'));
    } catch (err: unknown) {
      toast.error(t('projects.saveFailed'), {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsCreatingProjectFromSave(false);
    }
  };

  const handleExport = async (
    format: ExportFormat,
    separator: string,
    markdownAware: boolean,
  ) => {
    setShowExportDialog(false);
    try {
      const ok =
        format === 'bilingual'
          ? await exportBilingual(chunks)
          : await exportTranslation(chunks, format, { markdownAware, separator });
      if (ok) toast.success(t('files.exported'));
    } catch (err: unknown) {
      toast.error(t('files.exportError'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  if (mode === 'dashboard') {
    return <DashboardSidebar />;
  }

  // ══════════════════════════════════════════════════════════════════
  // EDITOR MODE
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-editorial-border bg-editorial-bg/60">
      {/* Workspace chip → back to dashboard */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={closeProject}
          disabled={isProcessing}
          title={t('sidebar.backToWorkspace')}
          aria-label={t('sidebar.backToWorkspace')}
          className="flex w-full items-center gap-1.5 rounded-[10px] border border-editorial-border bg-editorial-bg px-2.5 py-2 text-left transition-colors hover:border-editorial-accent/40 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LibraryBig size={16} className="shrink-0 text-editorial-muted" />
          <span className="min-w-0 flex-1 truncate font-display text-base italic text-editorial-ink">
            {activeWorkspace?.name ?? '—'}
          </span>
          <ChevronLeft size={16} className="shrink-0 text-editorial-muted" />
        </button>
      </div>

      {/* Doc meta + 4 actions */}
      <div className="px-3 pb-1 pt-2">
        <p className="mb-1.5 font-mono text-sm tabular-nums text-editorial-muted">
          {langCode(config.sourceLanguage)} → {langCode(config.targetLanguage)}
          {chunks.length > 0 && ` · ${completedCount}/${chunks.length}`}
        </p>
        <div className="flex items-center gap-0.5">
          <IconButton
            size="md"
            onClick={() => setShowProjectPanel(true)}
            title={t('projects.title')}
            tooltipSide="right"
          >
            <FolderOpen size={15} />
          </IconButton>
          <IconButton
            size="md"
            onClick={() => void handleImport()}
            title={t('files.import')}
            tooltipSide="right"
          >
            <Upload size={15} />
          </IconButton>
          <IconButton
            size="md"
            onClick={() => void handleSave()}
            title={t('projects.save')}
            disabled={isProcessing}
            tooltipSide="right"
          >
            <Save size={15} />
          </IconButton>
          {chunks.length > 0 && (
            <IconButton
              size="md"
              onClick={() => setShowExportDialog(true)}
              title={t('header.exportLabel')}
              tooltipSide="right"
            >
              <FileOutput size={15} />
            </IconButton>
          )}
        </div>
      </div>

      <div className="mx-3 mb-0 mt-1 h-px bg-editorial-border/60" />

      {/* Run panel */}
      <div className="flex flex-col gap-4 px-3 pt-4">
        {/* Mode toggle */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted/75">{t('pipeline.modeLabel')}</div>
          <div className="flex items-center justify-center gap-2">
            <Tooltip label={t('pipeline.modeTestHint')}>
              <button
                type="button"
                onClick={() => setPipelineMode('test')}
                disabled={isProcessing}
                aria-label={t('pipeline.modeTest')}
                className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                  pipelineMode === 'test'
                    ? 'border-editorial-accent bg-editorial-bg text-editorial-ink shadow-sm'
                    : 'border-editorial-border bg-editorial-textbox text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-ink'
                }`}
              >
                <FlaskConical size={14} />
              </button>
            </Tooltip>
            <Tooltip label={t('pipeline.modeProductionHint')}>
              <button
                type="button"
                onClick={() => setPipelineMode('production')}
                disabled={isProcessing}
                aria-label={t('pipeline.modeProduction')}
                className={`shrink-0 flex h-11 w-11 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                  pipelineMode === 'production'
                    ? 'border-editorial-accent bg-editorial-bg text-editorial-charcoal shadow-sm'
                    : 'border-editorial-border bg-editorial-textbox text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-ink'
                }`}
              >
                <Zap size={14} />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Run/Stop button */}
        <div className="flex flex-col items-center gap-2.5">
          <div className="relative">
            {isProcessing ? (
              cancelRequested ? (
                <Tooltip label={t('pipeline.stopping')}>
                  <button
                    type="button"
                    disabled
                    aria-label={t('pipeline.stopping')}
                    className="flex h-20 w-20 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted opacity-50 focus:outline-none"
                  >
                    <Loader2 size={28} className="animate-spin" />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip label={t('pipeline.stopPipeline')}>
                  <button
                    type="button"
                    onClick={onCancelPipeline}
                    aria-label={t('pipeline.stopPipeline')}
                    className="flex h-20 w-20 items-center justify-center rounded-full border border-editorial-accent bg-editorial-bg text-editorial-accent transition-colors hover:bg-editorial-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
                  >
                    <Square size={26} fill="currentColor" />
                  </button>
                </Tooltip>
              )
            ) : (
              <Tooltip label={t('pipeline.beginPipeline')} side="right">
                <button
                  type="button"
                  onClick={pipelineMode === 'test' ? onDryRun : onRunPipeline}
                  disabled={isProcessing || chunks.length === 0}
                  aria-label={t('pipeline.beginPipeline')}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-editorial-charcoal text-white transition-colors hover:bg-editorial-charcoal/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Play size={28} fill="currentColor" />
                </button>
              </Tooltip>
            )}
            {costEstimate.stages.length > 0 && (
              <div
                className="absolute -bottom-1.5 -right-1.5"
                onMouseEnter={() => setShowCostPanel(true)}
                onMouseLeave={() => setShowCostPanel(false)}
              >
                <button
                  type="button"
                  onFocus={() => setShowCostPanel(true)}
                  onBlur={() => setShowCostPanel(false)}
                  aria-label={t('cost.breakdown')}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal hover:text-editorial-charcoal focus:outline-none focus-visible:ring-1 focus-visible:ring-editorial-accent"
                >
                  <Info size={11} />
                </button>
              </div>
            )}
            {showCostPanel && costEstimate.stages.length > 0 && (
              <div
                className="absolute left-full top-1/2 z-[120] ml-3 w-64 -translate-y-1/2"
                onMouseEnter={() => setShowCostPanel(true)}
                onMouseLeave={() => setShowCostPanel(false)}
              >
                <CostBreakdownPanel estimate={costEstimate} />
              </div>
            )}
          </div>
          {chunks.length > 0 && (
            <span className="text-xs font-bold tabular-nums tracking-[0.12em] text-editorial-muted">
              {completedCount} / {pipelineMode === 'test' ? runChunkCount : chunks.length}
            </span>
          )}
        </div>

        {/* Chunk count + retranslate */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center justify-center gap-1">
            <Tooltip label={t('pipeline.decreaseTestChunkCount')}>
              <button
                type="button"
                onClick={() => setPipelineTestChunkCount(runChunkCount - 1)}
                disabled={testControlsDisabled || runChunkCount <= 1}
                aria-label={t('pipeline.decreaseTestChunkCount')}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal/60 hover:text-editorial-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Minus size={12} />
              </button>
            </Tooltip>
            <div
              className={`flex h-10 min-w-[38px] items-center justify-center rounded-full border px-2 text-xs font-bold tracking-[0.12em] ${
                pipelineMode === 'test'
                  ? 'border-editorial-warning/40 bg-editorial-textbox text-editorial-ink'
                  : 'border-editorial-border bg-editorial-bg text-editorial-muted'
              }`}
              title={t('pipeline.runChunkCount', { count: runChunkCount })}
            >
              {runChunkCount}
            </div>
            <Tooltip label={t('pipeline.increaseTestChunkCount')}>
              <button
                type="button"
                onClick={() => setPipelineTestChunkCount(runChunkCount + 1)}
                disabled={testControlsDisabled || runChunkCount >= chunks.length}
                aria-label={t('pipeline.increaseTestChunkCount')}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal/60 hover:text-editorial-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Plus size={12} />
              </button>
            </Tooltip>
          </div>
          <Tooltip
            label={
              pipelineMode === 'test'
                ? t('pipeline.retestChunk')
                : t('pipeline.retranslateChunk')
            }
          >
            <button
              type="button"
              onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)}
              disabled={isProcessing || !currentChunk || !currentChunk.originalText.trim()}
              aria-label={
                pipelineMode === 'test'
                  ? t('pipeline.retestChunk')
                  : t('pipeline.retranslateChunk')
              }
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-charcoal/60 hover:text-editorial-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                !currentChunk ? 'invisible' : ''
              }`}
            >
              <RotateCcw size={13} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-3 my-4 h-px bg-editorial-border/60" />

      {/* Pipeline selector */}
      <div className="flex flex-col gap-3 overflow-y-auto px-3">
        <div className="text-center text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted/75">{t('pipeline.sectionTitle')}</div>
        {activePipeline && (
          <div className="text-center">
            <p
              className="truncate font-display text-base italic text-editorial-ink"
              title={activePipeline.name}
            >
              {activePipeline.name}
            </p>
          </div>
        )}
        {pipelines.length === 0 ? (
          <div
            className="flex items-center justify-center"
            title={t('pipeline.pipelineNumber', { number: 1 })}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-editorial-accent text-xs font-black text-white opacity-55">
              1
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            {pipelines.map((pipeline, i) => {
              const isActive = pipeline.id === activePipelineId;
              const isPipelineRunning = isActive && isRunning;
              return (
                <div key={pipeline.id} className="group relative">
                  <Tooltip label={pipeline.name}>
                    <button
                      onClick={() => switchPipeline(pipeline.id)}
                      aria-label={pipeline.name}
                      className={`relative inline-flex h-[3.25rem] w-[3.25rem] items-center justify-center rounded-full border text-sm font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                        isActive
                          ? 'border-editorial-accent bg-editorial-accent text-white'
                          : 'border-editorial-border bg-editorial-bg text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
                      }`}
                    >
                      {isPipelineRunning ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-current" />
                      ) : (
                        i + 1
                      )}
                    </button>
                  </Tooltip>
                  {pipelines.length > 1 && !isPipelineRunning && (
                    <Tooltip label={t('pipeline.deletePipeline')} side="right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeletePipeline(pipeline.id, pipeline.name);
                        }}
                        aria-label={t('pipeline.deletePipeline')}
                        className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full border border-editorial-border bg-editorial-bg text-editorial-muted transition-colors hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none group-hover:flex"
                      >
                        <X size={8} />
                      </button>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {hasProject && pipelines.length < maxPipelines && (
          <div className="flex items-center justify-center pt-1">
            <Tooltip label={t('pipeline.newPipeline')}>
              <button
                onClick={() =>
                  createNewPipeline(
                    t('pipeline.pipelineNumber', { number: pipelines.length + 1 }),
                  )
                }
                aria-label={t('pipeline.newPipeline')}
                className="inline-flex shrink-0 h-11 w-11 items-center justify-center rounded-full border border-dashed border-editorial-border bg-editorial-bg text-base text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
              >
                +
              </button>
            </Tooltip>
          </div>
        )}
        <div className="flex items-center justify-center">
          <Tooltip label={t('pipeline.configurePipeline')}>
            <button
              onClick={() => setShowConfigDrawer(!showConfigDrawer)}
              aria-label={t('pipeline.configurePipeline')}
              className={`inline-flex shrink-0 h-11 w-11 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
                showConfigDrawer
                  ? 'border-editorial-accent bg-editorial-accent text-white'
                  : 'border-editorial-border bg-editorial-textbox text-editorial-muted hover:border-editorial-accent/60 hover:text-editorial-accent'
              }`}
            >
              <Settings2 size={15} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1" />

      {/* Panels */}
      <div className="pl-3 pr-0 pb-4 pt-3">
        <div className="-mr-px rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)]">
          <div className="pb-2 text-center text-[10px] font-bold uppercase tracking-[0.28em] text-editorial-muted/75">
            {t('document.panelsTitle')}
          </div>
          <div className="flex items-center justify-center gap-2">
            <IconButton
              size="md"
              tone={documentPaneFocus === 'both' ? 'accent' : 'default'}
              onClick={() => setDocumentPaneFocus('both')}
              title={t('document.focusBoth')}
              ariaPressed={documentPaneFocus === 'both'}
            >
              <Columns2 size={14} />
            </IconButton>
            <IconButton
              size="md"
              tone={documentPaneFocus === 'source' ? 'accent' : 'default'}
              onClick={() => setDocumentPaneFocus('source')}
              title={t('document.focusSource')}
              ariaPressed={documentPaneFocus === 'source'}
            >
              <PanelLeft size={14} />
            </IconButton>
            <IconButton
              size="md"
              tone={documentPaneFocus === 'translation' ? 'accent' : 'default'}
              onClick={() => setDocumentPaneFocus('translation')}
              title={t('document.focusTranslation')}
              ariaPressed={documentPaneFocus === 'translation'}
            >
              <PanelRight size={14} />
            </IconButton>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <IconButton
              size="md"
              tone={syncScrollEnabled && !syncScrollDisabled ? 'accent' : 'default'}
              onClick={() => setSyncScrollEnabled(!syncScrollEnabled)}
              title={
                syncScrollEnabled
                  ? t('document.scrollSyncDisable')
                  : t('document.scrollSyncEnable')
              }
              disabled={syncScrollDisabled}
              ariaPressed={syncScrollEnabled && !syncScrollDisabled}
            >
              {syncScrollEnabled && !syncScrollDisabled ? (
                <Link2 size={14} />
              ) : (
                <Link2Off size={14} />
              )}
            </IconButton>
            <IconButton
              size="md"
              tone={highlightsEnabled ? 'accent' : 'default'}
              onClick={() => setHighlightsEnabled(!highlightsEnabled)}
              title={t('document.highlightsToggle')}
              ariaPressed={highlightsEnabled}
            >
              <Highlighter size={14} />
            </IconButton>
          </div>
        </div>
      </div>

      {/* Dialogs */}
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
            onUseChunkingChange={(v) =>
              setPendingImport((c) => (c ? { ...c, useChunking: v } : c))
            }
            onWordsPerChunkChange={(v) =>
              setPendingImport((c) => (c ? { ...c, wordsPerChunk: v } : c))
            }
            onHeadingAwareChange={(v) =>
              setPendingImport((c) => (c ? { ...c, headingAware: v } : c))
            }
            onCarryTrailingShortBlocksChange={(v) =>
              setPendingImport((c) => (c ? { ...c, carryTrailingShortBlocks: v } : c))
            }
            onCancel={() => setPendingImport(null)}
            onConfirm={handleConfirmImport}
          />
        </Suspense>
      )}
      {saveDialogLoaded.current && (
        <Suspense fallback={null}>
          <SaveProjectDialog
            open={showSaveProjectDialog}
            onClose={() => setShowSaveProjectDialog(false)}
            onConfirm={handleFirstSave}
            saving={isCreatingProjectFromSave}
          />
        </Suspense>
      )}
      {showExportDialog && (
        <Suspense fallback={null}>
          <ExportDialog
            chunks={chunks}
            markdownAware={config.markdownAware === true}
            onConfirm={handleExport}
            onCancel={() => setShowExportDialog(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
