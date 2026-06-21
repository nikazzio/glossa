import {
  Columns2,
  FileOutput,
  FlaskConical,
  Highlighter,
  Info,
  Link2,
  Link2Off,
  Loader2,
  Minus,
  Network,
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
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';
import { confirm } from '../../stores/confirmStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import { usePricingStore } from '../../stores/pricingStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { estimatePipelineCost } from '../../utils/costEstimate';
import { CostBreakdownPanel } from '../pipeline/CostBadge';
import { IconButton, SectionLabel, Tooltip } from '../ui';
import { exportTranslation, exportBilingual } from '../../services/fileService';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import type { ExportFormat } from '../document/ExportDialog';

const ExportDialog = lazy(() =>
  import('../document/ExportDialog').then((m) => ({ default: m.ExportDialog })),
);

const COST_PANEL_OFFSET = 12;
const COST_PANEL_WIDTH = 256;
const VIEWPORT_MARGIN = 12;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function SidebarSectionShell({ children }: { children: ReactNode }) {
  return <div className="px-1">{children}</div>;
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

export function PipelineSidebarRunSection({
  collapsed = false,
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
}: {
  collapsed?: boolean;
  onRunPipeline?: () => void;
  onRunAuditOnly?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
}) {
  const { t } = useTranslation();
  const config = usePipelineStore((state) => state.config);
  const pipelineMode = useConfigStore((state) => state.pipelineMode);
  const setPipelineMode = useConfigStore((state) => state.setPipelineMode);
  const pipelineTestChunkCount = useConfigStore((state) => state.pipelineTestChunkCount);
  const setPipelineTestChunkCount = useConfigStore((state) => state.setPipelineTestChunkCount);
  const pricingOverrides = usePricingStore((state) => state.overrides);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const cancelRequested = useChunksStore((state) => state.cancelRequested);
  const totalChunks = useChunksStore((state) => state.chunks.length);
  const completedCount = useChunksStore((state) =>
    state.chunks.reduce(
      (count, chunk) => count + (chunk.status === 'completed' || chunk.status === 'preview' ? 1 : 0),
      0,
    ),
  );
  const costChunkTexts = useChunksStore(
    useShallow((state) => state.chunks.map((chunk) => chunk.originalText)),
  );
  const currentChunk = useChunksStore(
    useShallow((state) => {
      const chunk = state.chunks.find((entry) => entry.id === selectedChunkId);
      return chunk ? { id: chunk.id, hasOriginalText: chunk.originalText.trim().length > 0 } : null;
    }),
  );

  const [showCostPanel, setShowCostPanel] = useState(false);
  const costButtonRef = useRef<HTMLDivElement | null>(null);
  const costPanelCloseTimer = useRef<number | null>(null);

  const hasDocument = totalChunks > 0;
  const runChunkCount =
    pipelineMode === 'test'
      ? Math.max(1, Math.min(pipelineTestChunkCount, totalChunks || 1))
      : totalChunks;
  const testControlsDisabled = isProcessing || pipelineMode !== 'test';
  const costEstimate = useMemo(
    () => estimatePipelineCost(costChunkTexts.map((originalText) => ({ originalText })), config, pricingOverrides),
    [costChunkTexts, config, pricingOverrides],
  );

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

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 px-1 pt-1">
        <div className="flex flex-col items-center gap-1">
          {pipelineMode === 'test' ? (
            <FlaskConical size={14} className="text-editorial-accent" aria-hidden="true" />
          ) : (
            <Zap size={14} className="text-editorial-accent" aria-hidden="true" />
          )}
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-editorial-accent">
            {pipelineMode === 'test' ? t('pipeline.modeTest') : t('pipeline.modeProductionShort')}
          </span>
        </div>
        {isProcessing ? (
          cancelRequested ? (
            <IconButton size="md" tone="muted" disabled title={t('pipeline.stopping')} tooltipSide="right" className="h-9 w-9 bg-editorial-bg opacity-50">
              <Loader2 size={15} className="animate-spin" />
            </IconButton>
          ) : (
            <IconButton size="md" tone="default" onClick={onCancelPipeline} title={t('pipeline.stopPipeline')} tooltipSide="right" className="h-9 w-9 border-editorial-accent bg-editorial-bg text-editorial-accent hover:bg-editorial-accent/10">
              <Square size={14} fill="currentColor" />
            </IconButton>
          )
        ) : (
          <IconButton size="md" tone="charcoal" onClick={pipelineMode === 'test' ? onDryRun : onRunPipeline} disabled={isProcessing || !hasDocument} title={`${t('pipeline.beginPipeline')} (Ctrl+↵)`} ariaLabel={t('pipeline.beginPipeline')} tooltipSide="right" className="h-9 w-9 border-editorial-charcoal bg-editorial-charcoal text-white hover:bg-editorial-charcoal/85">
            <Play size={15} fill="currentColor" />
          </IconButton>
        )}
        {hasDocument ? (
          <span className="text-[10px] font-bold tabular-nums tracking-[0.1em] text-editorial-muted">
            {completedCount}/{pipelineMode === 'test' ? runChunkCount : totalChunks}
          </span>
        ) : null}
        <IconButton size="md" onClick={onRunAuditOnly} disabled={isProcessing || !hasDocument} title={t('pipeline.runAuditOnly')} ariaLabel={t('pipeline.runAuditOnly')} tooltipSide="right" className="h-9 w-9 bg-editorial-bg">
          <Highlighter size={14} />
        </IconButton>
        {currentChunk ? (
          <IconButton size="md" tone="charcoal" onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)} disabled={isProcessing || !currentChunk.hasOriginalText} title={pipelineMode === 'test' ? t('pipeline.retestChunk') : t('pipeline.retranslateChunk')} tooltipSide="right" className="h-9 w-9 bg-editorial-bg">
            <RotateCcw size={13} />
          </IconButton>
        ) : null}
      </div>
    );
  }

  return (
    <div className="px-2.5">
      <SidebarSectionShell>
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
                className={`h-11 w-11 ${pipelineMode === 'test' ? 'border-editorial-accent bg-editorial-bg text-editorial-ink shadow-sm' : 'bg-editorial-textbox'}`}
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
                className={`h-11 w-11 ${pipelineMode === 'production' ? 'border-editorial-accent bg-editorial-bg text-editorial-charcoal shadow-sm' : 'bg-editorial-textbox'}`}
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
                  title={`${t('pipeline.beginPipeline')} (Ctrl+↵)`}
                  ariaLabel={t('pipeline.beginPipeline')}
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
                {completedCount} / {pipelineMode === 'test' ? runChunkCount : totalChunks}
              </span>
            )}
            <IconButton
              size="md"
              tone="default"
              onClick={onRunAuditOnly}
              disabled={isProcessing || !hasDocument}
              title={t('pipeline.runAuditOnly')}
              ariaLabel={t('pipeline.runAuditOnly')}
              tooltipSide="right"
              className="mt-1 bg-editorial-bg"
            >
              <Highlighter size={14} />
            </IconButton>
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
              <Tooltip label={t('pipeline.runChunkCount', { count: runChunkCount })} side="right">
                <div
                  className={`flex h-10 min-w-[38px] items-center justify-center rounded-full border px-2 text-xs font-bold tracking-[0.12em] ${pipelineMode === 'test' ? 'border-editorial-warning/40 bg-editorial-textbox text-editorial-ink' : 'border-editorial-border bg-editorial-bg text-editorial-muted'}`}
                >
                  {runChunkCount}
                </div>
              </Tooltip>
              <IconButton
                size="md"
                tone="charcoal"
                onClick={() => setPipelineTestChunkCount(runChunkCount + 1)}
                disabled={testControlsDisabled || runChunkCount >= totalChunks}
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
              disabled={isProcessing || !currentChunk || !currentChunk.hasOriginalText}
              title={pipelineMode === 'test' ? t('pipeline.retestChunk') : t('pipeline.retranslateChunk')}
              tooltipSide="right"
              className={`h-10 w-10 bg-editorial-bg ${!currentChunk ? 'invisible' : ''}`}
            >
              <RotateCcw size={13} />
            </IconButton>
          </div>
        </div>
      </SidebarSectionShell>
    </div>
  );
}

export function PipelineSidebarPipelinesSection({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const runStatus = usePipelineStore((state) => state.runStatus);
  const {
    pipelines,
    activePipelineId,
    activePipelineName,
    currentProjectId,
    switchPipeline,
    createNewPipeline,
    deletePipeline,
  } = useProjectStore(
    useShallow((state) => ({
      pipelines: state.pipelines,
      activePipelineId: state.activePipelineId,
      activePipelineName: state.pipelines.find((pipeline) => pipeline.id === state.activePipelineId)?.name ?? null,
      currentProjectId: state.currentProjectId,
      switchPipeline: state.switchPipeline,
      createNewPipeline: state.createNewPipeline,
      deletePipeline: state.deletePipeline,
    })),
  );
  const maxPipelines = useConfigStore((state) => state.maxPipelines);
  const { showConfigDrawer, setShowConfigDrawer } = useUiStore(
    useShallow((state) => ({
      showConfigDrawer: state.showConfigDrawer,
      setShowConfigDrawer: state.setShowConfigDrawer,
    })),
  );

  const hasProject = Boolean(currentProjectId);
  const isRunning = runStatus === 'running';

  const handleDeletePipeline = useCallback(async (pipelineId: string, pipelineName: string) => {
    const ok = await confirm({
      title: t('pipeline.confirmDeleteTitle'),
      message: t('pipeline.confirmDeleteMessage', { name: pipelineName }),
      confirmLabel: t('pipeline.deletePipeline'),
      danger: true,
    });
    if (!ok) return;
    await deletePipeline(pipelineId);
  }, [deletePipeline, t]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 px-1 pt-1">
        <Zap size={13} className="text-editorial-muted/70" aria-hidden="true" />
        {pipelines.length === 0 ? (
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-editorial-accent text-xs font-black text-white opacity-55">1</span>
        ) : (
          pipelines.map((pipeline, index) => {
            const isActive = pipeline.id === activePipelineId;
            const isPipelineRunning = isActive && isRunning;
            return (
              <div key={pipeline.id} className="relative">
                <IconButton
                  size="md"
                  tone={isActive ? 'accent' : 'default'}
                  onClick={() => switchPipeline(pipeline.id)}
                  title={pipeline.name}
                  tooltipSide="right"
                  className="h-9 w-9 text-sm font-black"
                >
                  {isPipelineRunning ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-transparent border-t-current" />
                  ) : (
                    index + 1
                  )}
                </IconButton>
                {pipeline.mode === 'deepl-hybrid' && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-editorial-accent text-white pointer-events-none z-10" title="Pipeline DeepL Hybrid">
                    <Network size={9} />
                  </span>
                )}
              </div>
            );
          })
        )}
        {hasProject && pipelines.length < maxPipelines ? (
          <IconButton
            size="md"
            onClick={() => createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 }))}
            title={t('pipeline.newPipeline')}
            tooltipSide="right"
            className="h-9 w-9 border-dashed bg-editorial-bg"
          >
            <Plus size={14} />
          </IconButton>
        ) : null}
        <IconButton
          size="md"
          tone={showConfigDrawer ? 'accent' : 'default'}
          onClick={() => setShowConfigDrawer(!showConfigDrawer)}
          title={`${t('pipeline.configurePipeline')} (Ctrl+,)`}
          ariaLabel={t('pipeline.configurePipeline')}
          ariaPressed={showConfigDrawer}
          tooltipSide="right"
          className={`h-9 w-9 ${showConfigDrawer ? '' : 'bg-editorial-textbox'}`}
        >
          <Settings2 size={15} />
        </IconButton>
      </div>
    );
  }

  return (
    <div className="px-2.5">
      <SidebarSectionShell>
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
              {pipelines.map((pipeline, index) => {
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
                        index + 1
                      )}
                    </IconButton>
                    {pipeline.mode === 'deepl-hybrid' && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-editorial-accent text-white pointer-events-none z-10" title="Pipeline DeepL Hybrid">
                        <Network size={9} />
                      </span>
                    )}
                    {pipelines.length > 1 && !isPipelineRunning && (
                      <IconButton
                        size="sm"
                        tone="muted"
                        onClick={() => {
                          void handleDeletePipeline(pipeline.id, pipeline.name);
                        }}
                        title={t('pipeline.deletePipeline')}
                        ariaLabel={t('pipeline.deletePipeline')}
                        tooltipSide="right"
                        className="absolute -right-1 -top-1 z-10 h-5 w-5 bg-editorial-bg p-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
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
                onClick={() => createNewPipeline(t('pipeline.pipelineNumber', { number: pipelines.length + 1 }))}
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
              title={`${t('pipeline.configurePipeline')} (Ctrl+,)`}
              ariaLabel={t('pipeline.configurePipeline')}
              tooltipSide="right"
              className={`h-11 w-11 ${showConfigDrawer ? '' : 'bg-editorial-textbox'}`}
              ariaPressed={showConfigDrawer}
            >
              <Settings2 size={15} />
            </IconButton>
          </div>
        </div>
      </SidebarSectionShell>
    </div>
  );
}

export function PipelineSidebarDocumentSection({
  collapsed = false,
  onImportDocument,
}: {
  collapsed?: boolean;
  onImportDocument?: () => void;
}) {
  const { t } = useTranslation();
  const hasDocument = useChunksStore((state) => state.chunks.length > 0);
  const {
    showExportDialog,
    setShowExportDialog,
    documentPaneFocus,
    setDocumentPaneFocus,
    syncScrollEnabled,
    setSyncScrollEnabled,
    highlightsEnabled,
    setHighlightsEnabled,
  } = useUiStore(
    useShallow((state) => ({
      showExportDialog: state.showExportDialog,
      setShowExportDialog: state.setShowExportDialog,
      documentPaneFocus: state.documentPaneFocus,
      setDocumentPaneFocus: state.setDocumentPaneFocus,
      syncScrollEnabled: state.syncScrollEnabled,
      setSyncScrollEnabled: state.setSyncScrollEnabled,
      highlightsEnabled: state.highlightsEnabled,
      setHighlightsEnabled: state.setHighlightsEnabled,
    })),
  );

  const syncScrollDisabled = documentPaneFocus !== 'both';

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-3 px-1 pt-1">
        <Columns2 size={13} className="text-editorial-muted/70" aria-hidden="true" />
        {hasDocument ? (
          <>
            <IconButton size="md" tone={documentPaneFocus === 'both' ? 'accent' : 'default'} onClick={() => setDocumentPaneFocus('both')} title={t('document.focusBoth')} ariaPressed={documentPaneFocus === 'both'} tooltipSide="right" className="h-9 w-9">
              <Columns2 size={14} />
            </IconButton>
            <IconButton size="md" tone={documentPaneFocus === 'source' ? 'accent' : 'default'} onClick={() => setDocumentPaneFocus('source')} title={t('document.focusSource')} ariaPressed={documentPaneFocus === 'source'} tooltipSide="right" className="h-9 w-9">
              <PanelLeft size={14} />
            </IconButton>
            <IconButton size="md" tone={documentPaneFocus === 'translation' ? 'accent' : 'default'} onClick={() => setDocumentPaneFocus('translation')} title={t('document.focusTranslation')} ariaPressed={documentPaneFocus === 'translation'} tooltipSide="right" className="h-9 w-9">
              <PanelRight size={14} />
            </IconButton>
            <IconButton size="md" tone={syncScrollEnabled && !syncScrollDisabled ? 'accent' : 'default'} onClick={() => setSyncScrollEnabled(!syncScrollEnabled)} title={syncScrollEnabled ? t('document.scrollSyncDisable') : t('document.scrollSyncEnable')} disabled={syncScrollDisabled} ariaPressed={syncScrollEnabled && !syncScrollDisabled} tooltipSide="right" className="h-9 w-9">
              {syncScrollEnabled && !syncScrollDisabled ? <Link2 size={14} /> : <Link2Off size={14} />}
            </IconButton>
            <IconButton size="md" tone={highlightsEnabled ? 'accent' : 'default'} onClick={() => setHighlightsEnabled(!highlightsEnabled)} title={t('document.highlightsToggle')} ariaPressed={highlightsEnabled} tooltipSide="right" className="h-9 w-9">
              <Highlighter size={14} />
            </IconButton>
            <IconButton size="md" onClick={() => setShowExportDialog(true)} title={`${t('header.exportLabel')} (Ctrl+E)`} ariaLabel={t('header.exportLabel')} tooltipSide="right" className="h-9 w-9">
              <FileOutput size={14} />
            </IconButton>
          </>
        ) : null}
        <IconButton size="md" onClick={onImportDocument} title={t('files.import')} disabled={!onImportDocument} tooltipSide="right" className="h-9 w-9">
          <Upload size={14} />
        </IconButton>
        <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
      </div>
    );
  }

  return (
    <div className="px-2.5">
      <SidebarSectionShell>
        <div className="flex justify-center pb-2">
          <SectionLabel icon={Columns2} label={t('document.panelsTitle')} />
        </div>
        {hasDocument ? (
          <>
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
            <div className="mt-3 flex items-center justify-center gap-2 border-t border-editorial-border/40 pt-3">
              <IconButton
                size="md"
                tone={syncScrollEnabled && !syncScrollDisabled ? 'accent' : 'default'}
                onClick={() => setSyncScrollEnabled(!syncScrollEnabled)}
                title={syncScrollEnabled ? t('document.scrollSyncDisable') : t('document.scrollSyncEnable')}
                disabled={syncScrollDisabled}
                ariaPressed={syncScrollEnabled && !syncScrollDisabled}
              >
                {syncScrollEnabled && !syncScrollDisabled ? <Link2 size={14} /> : <Link2Off size={14} />}
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
                title={`${t('header.exportLabel')} (Ctrl+E)`}
                ariaLabel={t('header.exportLabel')}
              >
                <FileOutput size={14} />
              </IconButton>
            </div>
          </>
        ) : (
          <p className="px-1 text-center text-xs leading-relaxed text-editorial-muted [text-wrap:pretty]">
            {t('projectShell.noDocumentHint')}
          </p>
        )}
        <div className="mt-3 flex items-center justify-center gap-2 border-t border-editorial-border/50 pt-3">
          <IconButton
            size="md"
            onClick={onImportDocument}
            title={t('files.import')}
            disabled={!onImportDocument}
          >
            <Upload size={14} />
          </IconButton>
        </div>
      </SidebarSectionShell>

      <PipelineSidebarExportDialogHost open={showExportDialog} onOpenChange={setShowExportDialog} />
    </div>
  );
}

function PipelineSidebarExportDialogHost({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const chunks = useChunksStore((state) => state.chunks);
  const markdownAware = usePipelineStore((state) => state.config.markdownAware === true);

  const handleExport = useCallback(async (
    format: ExportFormat,
    separator: string,
    useMarkdownAware: boolean,
  ) => {
    onOpenChange(false);
    try {
      const annotations = useAnnotationsStore.getState().annotationsByChunkId;
      const ok =
        format === 'bilingual'
          ? await exportBilingual(chunks)
          : await exportTranslation(chunks, format, {
              markdownAware: useMarkdownAware,
              separator,
              annotations,
            });
      if (ok) toast.success(t('files.exported'));
    } catch (err: unknown) {
      toast.error(t('files.exportError'), {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, [chunks, onOpenChange, t]);

  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <ExportDialog
        chunks={chunks}
        markdownAware={markdownAware}
        onConfirm={handleExport}
        onCancel={() => onOpenChange(false)}
      />
    </Suspense>
  );
}
