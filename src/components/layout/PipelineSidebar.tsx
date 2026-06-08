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
  Zap,
} from 'lucide-react';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { confirm } from '../../stores/confirmStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { usePricingStore } from '../../stores/pricingStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { CostBreakdownPanel } from '../pipeline/CostBadge';
import { IconButton, SectionLabel, Tooltip } from '../ui';
import { exportTranslation, exportBilingual } from '../../services/fileService';
import type { ExportFormat } from '../document/ExportDialog';
import { DashboardSidebar } from './DashboardSidebar';

const ExportDialog = lazy(() =>
  import('../document/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);

const COST_PANEL_OFFSET = 12;
const COST_PANEL_WIDTH = 256;
const VIEWPORT_MARGIN = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function SidebarCostPanel({
  anchorRef,
  estimate,
  open,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  estimate: ReturnType<typeof estimatePipelineCost>;
  open: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 220;
    const left = Math.min(
      anchorRect.right + COST_PANEL_OFFSET,
      window.innerWidth - VIEWPORT_MARGIN - COST_PANEL_WIDTH,
    );
    const top = clamp(
      anchorRect.top + anchorRect.height / 2,
      VIEWPORT_MARGIN + panelHeight / 2,
      window.innerHeight - VIEWPORT_MARGIN - panelHeight / 2,
    );
    setStyle({
      left,
      top,
      width: COST_PANEL_WIDTH,
      transform: 'translateY(-50%)',
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [estimate, open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[160]"
      style={style ?? undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <CostBreakdownPanel estimate={estimate} />
    </div>,
    document.body,
  );
}

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
    showConfigDrawer,
    setShowConfigDrawer,
    selectedChunkId,
    documentPaneFocus,
    setDocumentPaneFocus,
    syncScrollEnabled,
    setSyncScrollEnabled,
    highlightsEnabled,
    setHighlightsEnabled,
  } = useUiStore();
  const pipelineMode = useConfigStore((s) => s.pipelineMode);
  const setPipelineMode = useConfigStore((s) => s.setPipelineMode);
  const pipelineTestChunkCount = useConfigStore((s) => s.pipelineTestChunkCount);
  const setPipelineTestChunkCount = useConfigStore((s) => s.setPipelineTestChunkCount);
  const maxPipelines = useConfigStore((s) => s.maxPipelines);
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const { activeWorkspace } = useWorkspaceStore();

  // ── Local state ───────────────────────────────────────────────────
  const [showCostPanel, setShowCostPanel] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const costButtonRef = useRef<HTMLDivElement | null>(null);
  const costPanelCloseTimer = useRef<number | null>(null);

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
  const activePipelineName = pipelines.find((p) => p.id === activePipelineId)?.name ?? null;

  const openCostPanel = useCallback(() => {
    if (costPanelCloseTimer.current !== null) {
      window.clearTimeout(costPanelCloseTimer.current);
      costPanelCloseTimer.current = null;
    }
    setShowCostPanel(true);
  }, []);

  const scheduleCloseCostPanel = useCallback(() => {
    if (costPanelCloseTimer.current !== null) {
      window.clearTimeout(costPanelCloseTimer.current);
    }
    costPanelCloseTimer.current = window.setTimeout(() => {
      setShowCostPanel(false);
      costPanelCloseTimer.current = null;
    }, 120);
  }, []);

  useEffect(() => {
    return () => {
      if (costPanelCloseTimer.current !== null) {
        window.clearTimeout(costPanelCloseTimer.current);
      }
    };
  }, []);

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
      className="relative isolate flex w-52 shrink-0 flex-col bg-editorial-bg/60 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:z-0 after:w-px after:bg-editorial-border after:content-['']"
    >
      <div className="relative z-10 pl-3 pr-0 pt-3">
        <div className="-mr-px rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)]">
          <div className="flex justify-center pb-2">
            <SectionLabel icon={LibraryBig} label={t('sidebar.workspaceSection')} />
          </div>
          <div className="flex items-center gap-2">
            <IconButton
              size="sm"
              onClick={closeProject}
              title={t('sidebar.backToWorkspace')}
              disabled={isProcessing}
              tooltipSide="right"
              className="shrink-0"
            >
              <ChevronLeft size={15} />
            </IconButton>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-display text-base italic leading-none text-editorial-ink">
                {activeWorkspace?.name ?? '—'}
              </span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
              onClick={onOpenWorkspaceSettings}
              title={t('workspace.configure')}
              tooltipSide="right"
            >
              <Settings2 size={15} />
            </IconButton>
          </div>
          {!hasDocument && (
            <div className="mt-2 flex justify-center">
              <IconButton
                size="md"
                onClick={onImportDocument}
                title={t('files.import')}
                tooltipSide="right"
                className="shrink-0"
              >
                <Upload size={15} />
              </IconButton>
            </div>
          )}
        </div>
      </div>

      <div className="mx-3 my-4 h-px bg-editorial-border/60" />

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pb-4 scrollbar-hidden">
        <div className="relative z-10 pl-3 pr-0">
          <div className="-mr-px rounded-l-[20px] rounded-r-none border border-r-0 border-editorial-border bg-editorial-paper px-3 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),6px_10px_20px_rgba(74,50,17,0.04)]">
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
                    className={`h-11 w-11 ${pipelineMode === 'test'
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
                    className={`h-11 w-11 ${pipelineMode === 'production'
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
                      ref={costButtonRef}
                      className="absolute -bottom-1.5 -right-1.5"
                      onMouseEnter={openCostPanel}
                      onMouseLeave={scheduleCloseCostPanel}
                    >
                      <IconButton
                        size="sm"
                        tone="charcoal"
                        onFocus={openCostPanel}
                        onBlur={scheduleCloseCostPanel}
                        title=""
                        ariaLabel={t('cost.breakdown')}
                        tooltipSide="right"
                        className="h-6 w-6 bg-editorial-bg p-0"
                      >
                        <Info size={11} />
                      </IconButton>
                    </div>
                  )}
                  <SidebarCostPanel
                    anchorRef={costButtonRef}
                    estimate={costEstimate}
                    open={showCostPanel && costEstimate.stages.length > 0}
                    onMouseEnter={openCostPanel}
                    onMouseLeave={scheduleCloseCostPanel}
                  />
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
                  <Tooltip
                    label={t('pipeline.runChunkCount', { count: runChunkCount })}
                    side="right"
                  >
                    <div
                      className={`flex h-10 min-w-[38px] items-center justify-center rounded-full border px-2 text-xs font-bold tracking-[0.12em] ${pipelineMode === 'test'
                        ? 'border-editorial-warning/40 bg-editorial-textbox text-editorial-ink'
                        : 'border-editorial-border bg-editorial-bg text-editorial-muted'
                        }`}
                    >
                      {runChunkCount}
                    </div>
                  </Tooltip>
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
              <div className="flex flex-col items-center gap-1">
                <SectionLabel icon={Zap} label={t('pipeline.sectionTitle')} />
                {activePipelineName && (
                  <span className="max-w-full truncate text-center text-xs text-editorial-muted">
                    {activePipelineName}
                  </span>
                )}
              </div>
              {pipelines.length === 0 ? (
                <Tooltip label={t('pipeline.pipelineNumber', { number: 1 })} side="right">
                  <div className="flex items-center justify-center">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-editorial-accent text-xs font-black text-white opacity-55">
                      1
                    </span>
                  </div>
                </Tooltip>
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
                            className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 bg-editorial-bg p-0 group-hover:flex"
                          > -
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
        <div className="relative z-10 pl-3 pr-0 pb-4 pt-3">
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
