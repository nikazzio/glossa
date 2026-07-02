import {
  FileText,
  Files,
  FlaskConical,
  Highlighter,
  Info,
  Languages,
  Loader2,
  Minus,
  Play,
  Plus,
  RotateCcw,
  Square,
  Zap,
} from 'lucide-react';
import {
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
import { useShallow } from 'zustand/react/shallow';
import { useChunksStore } from '../../../stores/chunksStore';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { usePricingStore } from '../../../stores/pricingStore';
import { useUiStore } from '../../../stores/uiStore';
import { useConfigStore } from '../../../stores/configStore';
import { estimatePipelineCost } from '../../../utils/costEstimate';
import { CostBreakdownPanel } from '../../pipeline/CostBadge';
import { IconButton, SectionLabel, Tooltip } from '../../ui';
import { SidebarSectionShell } from './PipelineSidebarShell';

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

export function PipelineSidebarRunSection({
  collapsed = false,
  onRunPipeline,
  onRunAuditOnly,
  onCancelPipeline,
  onDryRun,
  onRetranslateChunk,
  showAuditOnly = true,
  playFirst = false,
}: {
  collapsed?: boolean;
  onRunPipeline?: () => void;
  onRunAuditOnly?: () => void;
  onCancelPipeline?: () => void;
  onDryRun?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
  // Shell nuova (#291): "Solo audit" vive nel pannello Frammento → qui si nasconde.
  showAuditOnly?: boolean;
  // Shell nuova (#291): gerarchia "esegui → opzioni" — play focale in cima,
  // modalità e conteggio chunk come opzioni subordinate sotto.
  playFirst?: boolean;
}) {
  const { t } = useTranslation();
  const config = usePipelineStore((state) => state.config);
  const pipelineMode = useConfigStore((state) => state.pipelineMode);
  const setPipelineMode = useConfigStore((state) => state.setPipelineMode);
  const pipelineTestChunkCount = useConfigStore((state) => state.pipelineTestChunkCount);
  const setPipelineTestChunkCount = useConfigStore((state) => state.setPipelineTestChunkCount);
  const workMode = useConfigStore((state) => state.workMode);
  const setWorkMode = useConfigStore((state) => state.setWorkMode);
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
    if (playFirst) {
      return (
        <div className="flex flex-col items-center gap-2 px-1 pt-1">
          {isProcessing ? (
            cancelRequested ? (
              <IconButton size="md" tone="muted" disabled title={t('pipeline.stopping')} tooltipSide="right" className="h-9 w-9 opacity-50">
                <Loader2 size={15} className="animate-spin" />
              </IconButton>
            ) : (
              <IconButton size="md" tone="default" onClick={onCancelPipeline} title={t('pipeline.stopPipeline')} tooltipSide="right" className="h-9 w-9 border-editorial-danger bg-editorial-bg text-editorial-danger hover:bg-editorial-danger/10">
                <Square size={14} fill="currentColor" />
              </IconButton>
            )
          ) : workMode === 'chunk' ? (
            <IconButton size="md" tone="charcoal" onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)} disabled={!currentChunk || !currentChunk.hasOriginalText} title={t('pipeline.translateChunk')} tooltipSide="right" className="h-10 w-10">
              <Languages size={15} />
            </IconButton>
          ) : (
            <IconButton size="md" tone="charcoal" onClick={onRunPipeline} disabled={!hasDocument} title={t('pipeline.executeAll')} tooltipSide="right" className="h-10 w-10">
              <Play size={15} fill="currentColor" />
            </IconButton>
          )}
          {workMode === 'all' && hasDocument && (
            <span className="text-[11px] font-bold tabular-nums tracking-[0.1em] text-editorial-muted">
              {completedCount}/{totalChunks}
            </span>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-3 px-1 pt-1">
        <div className="flex flex-col items-center gap-1">
          {pipelineMode === 'test' ? (
            <FlaskConical size={14} className="text-editorial-accent" aria-hidden="true" />
          ) : (
            <Zap size={14} className="text-editorial-accent" aria-hidden="true" />
          )}
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-accent">
            {pipelineMode === 'test' ? t('pipeline.modeTest') : t('pipeline.modeProductionShort')}
          </span>
        </div>
        {isProcessing ? (
          cancelRequested ? (
            <IconButton size="md" tone="muted" disabled title={t('pipeline.stopping')} tooltipSide="right" className="h-9 w-9 bg-editorial-bg opacity-50">
              <Loader2 size={15} className="animate-spin" />
            </IconButton>
          ) : (
            <IconButton size="md" tone="default" onClick={onCancelPipeline} title={t('pipeline.stopPipeline')} tooltipSide="right" className="h-9 w-9 border-editorial-danger bg-editorial-bg text-editorial-danger hover:bg-editorial-danger/10">
              <Square size={14} fill="currentColor" />
            </IconButton>
          )
        ) : (
          <IconButton size="md" tone="charcoal" onClick={pipelineMode === 'test' ? onDryRun : onRunPipeline} disabled={isProcessing || !hasDocument} title={`${t('pipeline.beginPipeline')} (Ctrl+↵)`} ariaLabel={t('pipeline.beginPipeline')} tooltipSide="right" className="h-9 w-9 border-editorial-charcoal bg-editorial-charcoal text-white hover:bg-editorial-charcoal/85">
            <Play size={15} fill="currentColor" />
          </IconButton>
        )}
        {hasDocument ? (
          <span className="text-[11px] font-bold tabular-nums tracking-[0.1em] text-editorial-muted">
            {completedCount}/{pipelineMode === 'test' ? runChunkCount : totalChunks}
          </span>
        ) : null}
        {showAuditOnly ? (
          <IconButton size="md" onClick={onRunAuditOnly} disabled={isProcessing || !hasDocument} title={t('pipeline.runAuditOnly')} ariaLabel={t('pipeline.runAuditOnly')} tooltipSide="right" className="h-9 w-9 bg-editorial-bg">
            <Highlighter size={14} />
          </IconButton>
        ) : null}
        {currentChunk ? (
          <IconButton size="md" tone="charcoal" onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)} disabled={isProcessing || !currentChunk.hasOriginalText} title={pipelineMode === 'test' ? t('pipeline.retestChunk') : t('pipeline.retranslateChunk')} tooltipSide="right" className="h-9 w-9 bg-editorial-bg">
            <RotateCcw size={13} />
          </IconButton>
        ) : null}
      </div>
    );
  }

  if (playFirst) {
    return (
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex items-center gap-1">
            <IconButton
              size="md"
              tone="muted"
              onClick={() => setWorkMode('chunk')}
              disabled={isProcessing}
              title={t('pipeline.workModeChunk')}
              ariaLabel={t('pipeline.workModeChunk')}
              ariaPressed={workMode === 'chunk'}
              tooltipSide="bottom"
              className={`h-9 w-9 ${
                workMode === 'chunk'
                  ? 'border-editorial-accent/55 bg-editorial-accent/10 text-editorial-accent'
                  : 'bg-editorial-bg'
              }`}
            >
              <FileText size={14} />
            </IconButton>
            <IconButton
              size="md"
              tone="muted"
              onClick={() => setWorkMode('all')}
              disabled={isProcessing}
              title={t('pipeline.workModeAll')}
              ariaLabel={t('pipeline.workModeAll')}
              ariaPressed={workMode === 'all'}
              tooltipSide="bottom"
              className={`h-9 w-9 ${
                workMode === 'all'
                  ? 'border-editorial-accent/55 bg-editorial-accent/10 text-editorial-accent'
                  : 'bg-editorial-bg'
              }`}
            >
              <Files size={14} />
            </IconButton>
          </div>
          {workMode === 'all' && hasDocument ? (
            <span className="ml-auto shrink-0 text-[11px] font-semibold tabular-nums tracking-[0.08em] text-editorial-muted">
              {completedCount}/{totalChunks}
            </span>
          ) : null}
        </div>
        {workMode === 'chunk' ? (
          <IconButton
            size="md"
            tone="charcoal"
            onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)}
            disabled={isProcessing || !currentChunk || !currentChunk.hasOriginalText}
            title={t('pipeline.translateChunk')}
            ariaLabel={t('pipeline.translateChunk')}
            tooltipSide="bottom"
            className="h-10 w-10 shrink-0 border-editorial-charcoal/40 bg-editorial-bg hover:border-editorial-charcoal/65 hover:bg-editorial-textbox/70"
          >
            <Languages size={16} />
          </IconButton>
        ) : isProcessing ? (
          cancelRequested ? (
            <IconButton
              size="md"
              tone="muted"
              disabled
              title={t('pipeline.stopping')}
              tooltipSide="bottom"
              className="h-10 w-10 shrink-0 bg-editorial-bg opacity-50"
            >
              <Loader2 size={15} className="animate-spin" />
            </IconButton>
          ) : (
            <IconButton
              size="md"
              tone="danger"
              onClick={onCancelPipeline}
              title={t('pipeline.stopPipeline')}
              ariaLabel={t('pipeline.stopPipeline')}
              tooltipSide="bottom"
              className="h-10 w-10 shrink-0 bg-editorial-bg"
            >
              <Square size={15} fill="currentColor" />
            </IconButton>
          )
        ) : (
          <IconButton
            size="md"
            tone="charcoal"
            onClick={onRunPipeline}
            disabled={!hasDocument}
            title={t('pipeline.executeAll')}
            ariaLabel={t('pipeline.executeAll')}
            tooltipSide="bottom"
            className="h-10 w-10 shrink-0 border-editorial-charcoal/40 bg-editorial-bg hover:border-editorial-charcoal/65 hover:bg-editorial-textbox/70"
          >
            <Play size={16} fill="currentColor" />
          </IconButton>
        )}
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

          <div className={`flex flex-col items-center gap-2.5 ${playFirst ? 'order-1' : ''}`}>
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
                    className="h-20 w-20 border-editorial-danger bg-editorial-bg text-editorial-danger hover:bg-editorial-danger/10"
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
            {showAuditOnly ? (
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
            ) : null}
          </div>

          <div className={`flex flex-col items-center gap-1.5 ${playFirst ? 'order-3' : ''}`}>
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
