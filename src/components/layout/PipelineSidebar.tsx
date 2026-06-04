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
  Settings2,
  Square,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
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
import { IconButton, SectionLabel } from '../ui';
import { exportTranslation, exportBilingual } from '../../services/fileService';
import type { ExportFormat } from '../document/ExportDialog';
import { DashboardSidebar } from './DashboardSidebar';

const ExportDialog = lazy(() =>
  import('../document/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);
interface PipelineSidebarProps {
  mode?: 'dashboard' | 'editor';
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  onImportDocument?: () => void;
  onOpenWorkspaceSettings?: () => void;
}

export function PipelineSidebar({
  mode = 'editor',
  onRunPipeline,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
  onImportDocument,
  onOpenWorkspaceSettings,
}: PipelineSidebarProps) {
  const { t } = useTranslation();

  // ── Stores — all hooks before any conditional return ─────────────
  const { config } = usePipelineStore();
  const runStatus = usePipelineStore((s) => s.runStatus);
  const {
    pipelines,
    activePipelineId,
    currentProjectId,
    switchPipeline,
    createNewPipeline,
    deletePipeline,
    setShowProjectPanel,
    closeProject,
  } = useProjectStore();
  const { chunks, isProcessing, cancelRequested } = useChunksStore();
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
  } = useUiStore();
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const { activeWorkspace } = useWorkspaceStore();

  // ── Local state ───────────────────────────────────────────────────
  const [showCostPanel, setShowCostPanel] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  // ── Derived ───────────────────────────────────────────────────────
  const isRunning = runStatus === 'running';
  const hasProject = !!currentProjectId;
  const hasDocument = chunks.length > 0;
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
    <motion.div
      initial={{ opacity: 0, x: -22 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="flex w-52 shrink-0 flex-col border-r border-editorial-border bg-editorial-bg/60"
    >
      <div className="pl-3 pr-0 pt-3">
        <div className="-mr-px rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)]">
          <div className="flex justify-center pb-2">
            <SectionLabel icon={LibraryBig} label={t('sidebar.workspaceSection')} />
          </div>
          <div className="text-center">
            <span className="block truncate font-display text-base italic text-editorial-ink">
              {activeWorkspace?.name ?? '—'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <IconButton
              size="md"
              onClick={closeProject}
              title={t('sidebar.backToWorkspace')}
              disabled={isProcessing}
              tooltipSide="right"
            >
              <ChevronLeft size={15} />
            </IconButton>
            <IconButton
              size="md"
              onClick={onOpenWorkspaceSettings}
              title={t('workspace.configure')}
              tooltipSide="right"
            >
              <Settings2 size={15} />
            </IconButton>
          </div>
        </div>
      </div>

      <div className="mx-3 my-4 h-px bg-editorial-border/60" />

      <div className="min-h-0 flex-1 overflow-y-auto pb-4 custom-scrollbar">
        <div className="pl-3 pr-0">
          <div className="-mr-px rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)]">
            <div className="flex justify-center pb-3">
              <SectionLabel icon={FolderOpen} label={t('header.projectLabel')} />
            </div>

            <div className="mb-4 flex items-center justify-center gap-2">
              <IconButton
                size="md"
                onClick={() => setShowProjectPanel(true)}
                title={t('projects.title')}
                tooltipSide="right"
              >
                <FolderOpen size={15} />
              </IconButton>
              {!hasDocument ? (
                <IconButton
                  size="md"
                  onClick={onImportDocument}
                  title={t('files.import')}
                  tooltipSide="right"
                >
                  <Upload size={15} />
                </IconButton>
              ) : null}
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center gap-2">
                <SectionLabel icon={FlaskConical} label={t('pipeline.modeLabel')} />
                <div className="flex items-center justify-center gap-2">
                  <IconButton
                    size="lg"
                    tone="default"
                    onClick={() => setPipelineMode('test')}
                    disabled={isProcessing}
                    title={t('pipeline.modeTestHint')}
                    ariaLabel={t('pipeline.modeTest')}
                    ariaPressed={pipelineMode === 'test'}
                    tooltipSide="right"
                    className={`h-11 w-11 ${
                      pipelineMode === 'test'
                        ? 'border-editorial-accent bg-editorial-bg text-editorial-ink shadow-sm'
                        : 'bg-editorial-textbox'
                    }`}
                  >
                    <FlaskConical size={14} />
                  </IconButton>
                  <IconButton
                    size="lg"
                    tone="default"
                    onClick={() => setPipelineMode('production')}
                    disabled={isProcessing}
                    title={t('pipeline.modeProductionHint')}
                    ariaLabel={t('pipeline.modeProduction')}
                    ariaPressed={pipelineMode === 'production'}
                    tooltipSide="right"
                    className={`h-11 w-11 ${
                      pipelineMode === 'production'
                        ? 'border-editorial-accent bg-editorial-bg text-editorial-charcoal shadow-sm'
                        : 'bg-editorial-textbox'
                    }`}
                  >
                    <Zap size={14} />
                  </IconButton>
                </div>
              </div>

              <div className="flex flex-col items-center gap-2.5">
                <div className="relative">
                  {isProcessing ? (
                    cancelRequested ? (
                      <IconButton
                        size="lg"
                        tone="muted"
                        disabled
                        title={t('pipeline.stopping')}
                        tooltipSide="right"
                        className="h-20 w-20 bg-editorial-bg opacity-50"
                      >
                        <Loader2 size={28} className="animate-spin" />
                      </IconButton>
                    ) : (
                      <IconButton
                        size="lg"
                        tone="default"
                        onClick={onCancelPipeline}
                        title={t('pipeline.stopPipeline')}
                        tooltipSide="right"
                        className="h-20 w-20 border-editorial-accent bg-editorial-bg text-editorial-accent hover:bg-editorial-accent/10"
                      >
                        <Square size={26} fill="currentColor" />
                      </IconButton>
                    )
                  ) : (
                    <IconButton
                      size="lg"
                      tone="charcoal"
                      onClick={pipelineMode === 'test' ? onDryRun : onRunPipeline}
                      disabled={isProcessing || !hasDocument}
                      title={t('pipeline.beginPipeline')}
                      tooltipSide="right"
                      className="h-20 w-20 border-editorial-charcoal bg-editorial-charcoal text-white hover:bg-editorial-charcoal/85"
                    >
                      <Play size={28} fill="currentColor" />
                    </IconButton>
                  )}
                  {costEstimate.stages.length > 0 && (
                    <div
                      className="absolute -bottom-1.5 -right-1.5"
                      onMouseEnter={() => setShowCostPanel(true)}
                      onMouseLeave={() => setShowCostPanel(false)}
                    >
                      <IconButton
                        size="sm"
                        tone="charcoal"
                        onFocus={() => setShowCostPanel(true)}
                        onBlur={() => setShowCostPanel(false)}
                        title={t('cost.breakdown')}
                        tooltipSide="right"
                        className="h-6 w-6 bg-editorial-bg p-0"
                      >
                        <Info size={11} />
                      </IconButton>
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
                {hasDocument && (
                  <span className="text-xs font-bold tabular-nums tracking-[0.12em] text-editorial-muted">
                    {completedCount} / {pipelineMode === 'test' ? runChunkCount : chunks.length}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center justify-center gap-1">
                  <IconButton
                    size="md"
                    tone="charcoal"
                    onClick={() => setPipelineTestChunkCount(runChunkCount - 1)}
                    disabled={testControlsDisabled || runChunkCount <= 1}
                    title={t('pipeline.decreaseTestChunkCount')}
                    tooltipSide="right"
                    className="h-10 w-10 bg-editorial-bg"
                  >
                    <Minus size={12} />
                  </IconButton>
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
                  <IconButton
                    size="md"
                    tone="charcoal"
                    onClick={() => setPipelineTestChunkCount(runChunkCount + 1)}
                    disabled={testControlsDisabled || runChunkCount >= chunks.length}
                    title={t('pipeline.increaseTestChunkCount')}
                    tooltipSide="right"
                    className="h-10 w-10 bg-editorial-bg"
                  >
                    <Plus size={12} />
                  </IconButton>
                </div>
                <IconButton
                  size="md"
                  tone="charcoal"
                  onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)}
                  disabled={isProcessing || !currentChunk || !currentChunk.originalText.trim()}
                  title={
                    pipelineMode === 'test'
                      ? t('pipeline.retestChunk')
                      : t('pipeline.retranslateChunk')
                  }
                  tooltipSide="right"
                  className={`h-10 w-10 bg-editorial-bg ${!currentChunk ? 'invisible' : ''}`}
                >
                  <RotateCcw size={13} />
                </IconButton>
              </div>
            </div>

            <div className="my-4 h-px bg-editorial-border/60" />

            <div className="flex flex-col gap-3">
              <div className="flex justify-center">
                <SectionLabel icon={Zap} label={t('pipeline.sectionTitle')} />
              </div>
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
                        <IconButton
                          size="lg"
                          tone={isActive ? 'accent' : 'default'}
                          onClick={() => switchPipeline(pipeline.id)}
                          title={pipeline.name}
                          tooltipSide="right"
                          className="h-[3.25rem] w-[3.25rem] text-sm font-black"
                        >
                          {isPipelineRunning ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-current" />
                          ) : (
                            i + 1
                          )}
                        </IconButton>
                        {pipelines.length > 1 && !isPipelineRunning && (
                          <IconButton
                            size="sm"
                            tone="muted"
                            onClick={() => {
                              void handleDeletePipeline(pipeline.id, pipeline.name);
                            }}
                            title={t('pipeline.deletePipeline')}
                            tooltipSide="right"
                            className="absolute -right-1 -top-1 hidden h-4 w-4 p-0 group-hover:flex"
                          >
                            <X size={8} />
                          </IconButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {hasProject && pipelines.length < maxPipelines && (
                <div className="flex items-center justify-center pt-1">
                  <IconButton
                    size="lg"
                    tone="default"
                    onClick={() =>
                      createNewPipeline(
                        t('pipeline.pipelineNumber', { number: pipelines.length + 1 }),
                      )
                    }
                    title={t('pipeline.newPipeline')}
                    tooltipSide="right"
                    className="h-11 w-11 border-dashed bg-editorial-bg"
                  >
                    <Plus size={14} />
                  </IconButton>
                </div>
              )}
              <div className="flex items-center justify-center">
                <IconButton
                  size="lg"
                  tone={showConfigDrawer ? 'accent' : 'default'}
                  onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                  title={t('pipeline.configurePipeline')}
                  tooltipSide="right"
                  className={`h-11 w-11 ${showConfigDrawer ? '' : 'bg-editorial-textbox'}`}
                  ariaPressed={showConfigDrawer}
                >
                  <Settings2 size={15} />
                </IconButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {hasDocument ? (
        <div className="pl-3 pr-0 pb-4 pt-3">
          <div className="-mr-px rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)]">
            <div className="flex justify-center pb-2">
              <SectionLabel icon={Columns2} label={t('document.panelsTitle')} />
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
              <IconButton
                size="md"
                onClick={() => setShowExportDialog(true)}
                title={t('header.exportLabel')}
              >
                <FileOutput size={14} />
              </IconButton>
            </div>
          </div>
        </div>
      ) : null}

      {/* Dialogs */}
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
    </motion.div>
  );
}
