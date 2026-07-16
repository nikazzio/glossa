import {
  Info,
  Languages,
  Loader2,
  Minus,
  Play,
  Plus,
  Repeat,
  Square,
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
import { IconButton, Tooltip } from '../../ui';

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
  onCancelPipeline,
  onRetranslateChunk,
}: {
  collapsed?: boolean;
  onRunPipeline?: () => void;
  onCancelPipeline?: () => void;
  onRetranslateChunk?: (chunkId: string) => void;
}) {
  const { t } = useTranslation();
  const config = usePipelineStore((state) => state.config);
  const workMode = useConfigStore((state) => state.workMode);
  const setWorkMode = useConfigStore((state) => state.setWorkMode);
  const pricingOverrides = usePricingStore((state) => state.overrides);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const cancelRequested = useChunksStore((state) => state.cancelRequested);
  const totalChunks = useChunksStore((state) => state.chunks.length);
  const repeatChunkCount = useConfigStore((state) => state.repeatChunkCount);
  const setRepeatChunkCount = useConfigStore((state) => state.setRepeatChunkCount);
  const isLimitedRun = repeatChunkCount !== null && repeatChunkCount < totalChunks;
  // Se l'utente ha impostato un numero, il run reale si ferma lì: tooltip e
  // contatore devono riflettere quel numero, non l'intero documento.
  const runChunkCount = isLimitedRun ? repeatChunkCount : totalChunks;
  // Senza limite esplicito il contatore mostra il totale (equivale a "tutti");
  // +/- partono sempre da un numero concreto, mai da un valore vuoto.
  const effectiveRepeatCount = repeatChunkCount ?? totalChunks;
  const canDecreaseRepeatCount = !isProcessing && effectiveRepeatCount > 1;
  const canIncreaseRepeatCount = !isProcessing && effectiveRepeatCount < totalChunks;
  const decreaseRepeatCount = () => setRepeatChunkCount(Math.max(1, effectiveRepeatCount - 1));
  const increaseRepeatCount = () => {
    const next = effectiveRepeatCount + 1;
    // Tornare al totale del documento equivale a "nessun limite".
    setRepeatChunkCount(next >= totalChunks ? null : next);
  };
  const completedCount = useChunksStore((state) =>
    state.chunks.slice(0, runChunkCount).reduce(
      (count, chunk) => count + (chunk.status === 'completed' ? 1 : 0),
      0,
    ),
  );
  const runActionLabel = isLimitedRun
    ? t('pipeline.executeLimited', { count: runChunkCount })
    : t('pipeline.executeAll');
  const costChunkTexts = useChunksStore(
    useShallow((state) => state.chunks.map((chunk) => chunk.sourceProcessingText)),
  );
  const currentChunk = useChunksStore(
    useShallow((state) => {
      const chunk = state.chunks.find((entry) => entry.id === selectedChunkId);
      return chunk
        ? { id: chunk.id, hasSourceText: chunk.sourceProcessingText.trim().length > 0, sourceText: chunk.sourceProcessingText }
        : null;
    }),
  );

  const [showCostPanel, setShowCostPanel] = useState(false);
  const costButtonRef = useRef<HTMLDivElement | null>(null);
  const costPanelCloseTimer = useRef<number | null>(null);

  const hasDocument = totalChunks > 0;
  // Preventivo per l'azione "esegui" in modalità Blocchi multipli: si ferma
  // al numero impostato, non all'intero documento se è più corto/lungo.
  const pipelineCostEstimate = useMemo(
    () => estimatePipelineCost(
      costChunkTexts.slice(0, runChunkCount).map((sourceText) => ({ sourceText })),
      config,
      pricingOverrides,
    ),
    [costChunkTexts, runChunkCount, config, pricingOverrides],
  );
  // Preventivo per l'azione "traduci solo il chunk corrente" (modalità 'chunk').
  const chunkCostEstimate = useMemo(
    () => estimatePipelineCost(
      currentChunk?.hasSourceText ? [{ sourceText: currentChunk.sourceText }] : [],
      config,
      pricingOverrides,
    ),
    [currentChunk, config, pricingOverrides],
  );
  const runActionCostEstimate = workMode === 'chunk' ? chunkCostEstimate : pipelineCostEstimate;

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
          <IconButton size="md" tone="charcoal" onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)} disabled={!currentChunk || !currentChunk.hasSourceText} title={t('pipeline.translateChunk')} tooltipSide="right" className="h-9 w-9">
            <Languages size={14} />
          </IconButton>
        ) : (
          <IconButton size="md" tone="charcoal" onClick={onRunPipeline} disabled={!hasDocument} title={runActionLabel} tooltipSide="right" className="h-9 w-9">
            <Play size={14} fill="currentColor" />
          </IconButton>
        )}
        {workMode === 'all' && hasDocument && (
          <span className="text-[11px] font-bold tabular-nums tracking-[0.1em] text-editorial-muted">
            {completedCount}/{runChunkCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative shrink-0">
        {workMode === 'chunk' ? (
          <IconButton
            size="md"
            tone="charcoal"
            onClick={() => currentChunk && onRetranslateChunk?.(currentChunk.id)}
            disabled={isProcessing || !currentChunk || !currentChunk.hasSourceText}
            title={t('pipeline.translateChunk')}
            ariaLabel={t('pipeline.translateChunk')}
            tooltipSide="bottom"
            className="h-14 w-14 border-editorial-charcoal/40 bg-editorial-bg hover:border-editorial-charcoal/65 hover:bg-editorial-textbox/70"
          >
            <Languages size={22} />
          </IconButton>
        ) : isProcessing ? (
          cancelRequested ? (
            <IconButton
              size="md"
              tone="default"
              disabled
              title={t('pipeline.stopping')}
              tooltipSide="bottom"
              className="h-14 w-14 bg-editorial-bg opacity-50"
            >
              <Loader2 size={22} className="animate-spin" />
            </IconButton>
          ) : (
            <IconButton
              size="md"
              tone="danger"
              onClick={onCancelPipeline}
              title={t('pipeline.stopPipeline')}
              ariaLabel={t('pipeline.stopPipeline')}
              tooltipSide="bottom"
              className="h-14 w-14 bg-editorial-bg"
            >
              <Square size={20} fill="currentColor" />
            </IconButton>
          )
        ) : (
          <IconButton
            size="md"
            tone="charcoal"
            onClick={onRunPipeline}
            disabled={!hasDocument}
            title={runActionLabel}
            ariaLabel={runActionLabel}
            tooltipSide="bottom"
            className="h-14 w-14 border-editorial-charcoal/40 bg-editorial-bg hover:border-editorial-charcoal/65 hover:bg-editorial-textbox/70"
          >
            <Play size={22} fill="currentColor" />
          </IconButton>
        )}
        {runActionCostEstimate.stages.length > 0 && (
          <div
            ref={costButtonRef}
            className="absolute -bottom-1 -right-1"
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
              tooltipSide="bottom"
              className="h-5 w-5 bg-editorial-bg p-0"
            >
              <Info size={9} />
            </IconButton>
          </div>
        )}
        <SidebarCostPanel
          anchorRef={costButtonRef}
          estimate={runActionCostEstimate}
          open={showCostPanel && runActionCostEstimate.stages.length > 0}
          onMouseEnter={openCostPanel}
          onMouseLeave={scheduleCloseCostPanel}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-end gap-1.5">
        <Tooltip label={t('pipeline.repeatModeLabel')} side="bottom">
          <button
            type="button"
            role="switch"
            aria-label={t('pipeline.repeatModeLabel')}
            aria-checked={workMode === 'all'}
            disabled={isProcessing}
            onClick={() => setWorkMode(workMode === 'all' ? 'chunk' : 'all')}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent disabled:cursor-not-allowed disabled:opacity-40 ${
              workMode === 'all' ? 'bg-editorial-accent' : 'bg-editorial-border'
            }`}
          >
            <span
              className={`inline-flex h-7 w-7 transform items-center justify-center rounded-full bg-white shadow-sm transition-transform ${
                workMode === 'all' ? 'translate-x-6' : 'translate-x-0'
              }`}
            >
              <Repeat size={14} className={workMode === 'all' ? 'text-editorial-accent' : 'text-editorial-muted'} />
            </span>
          </button>
        </Tooltip>
        {/* Altezza fissa: sempre presente per non spostare il pulsante
            principale quando si accende/spegne il toggle sopra. */}
        <div className="flex h-7 items-center gap-1.5">
          {workMode === 'all' && hasDocument ? (
            <>
              <IconButton
                size="sm"
                tone="default"
                onClick={decreaseRepeatCount}
                disabled={!canDecreaseRepeatCount}
                title={t('pipeline.repeatChunkCountDecrease')}
                ariaLabel={t('pipeline.repeatChunkCountDecrease')}
                tooltipSide="bottom"
                className="h-6 w-6 bg-editorial-bg"
              >
                <Minus size={11} />
              </IconButton>
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-editorial-accent/35 bg-editorial-accent/10 font-display text-sm italic text-editorial-accent tabular-nums"
                aria-label={t('pipeline.repeatChunkCountLabel')}
              >
                {effectiveRepeatCount}
              </span>
              <IconButton
                size="sm"
                tone="default"
                onClick={increaseRepeatCount}
                disabled={!canIncreaseRepeatCount}
                title={t('pipeline.repeatChunkCountIncrease')}
                ariaLabel={t('pipeline.repeatChunkCountIncrease')}
                tooltipSide="bottom"
                className="h-6 w-6 bg-editorial-bg"
              >
                <Plus size={11} />
              </IconButton>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
