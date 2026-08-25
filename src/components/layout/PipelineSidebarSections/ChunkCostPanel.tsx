import { CircleDollarSign, Coins } from 'lucide-react';
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
import { useOperationLogStore } from '../../../stores/operationLogStore';
import { estimatePipelineCost } from '../../../utils/costEstimate';
import { summarizeChunkUsage, formatUsd } from '../../../utils/operationLogStats';
import { CostBreakdownPanel, formatCost } from '../../pipeline/CostBadge';
import { Popover, ScopeBreakdownCarousel } from '../../ui';

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

/**
 * Stima costo (prima di tradurre) + consumo reale del frammento aperto (dopo)
 * — vivevano sparse (un badge nascosto sul pulsante grande, e una fascia nella
 * colonna centrale); ora un solo posto, accanto alla navigazione fra
 * frammenti. Le due righe restano separate: stima e reale sono unità di
 * misura diverse per costruzione, non hanno senso affiancate come se fossero
 * comparabili 1:1.
 */
export function ChunkCostPanel() {
  const { t } = useTranslation();
  const config = usePipelineStore((state) => state.config);
  const workMode = useConfigStore((state) => state.workMode);
  const pricingOverrides = usePricingStore((state) => state.overrides);
  const selectedChunkId = useUiStore((state) => state.selectedChunkId);
  const totalChunks = useChunksStore((state) => state.chunks.length);
  const repeatChunkCount = useConfigStore((state) => state.repeatChunkCount);
  const isLimitedRun = repeatChunkCount !== null && repeatChunkCount < totalChunks;
  const runChunkCount = isLimitedRun ? repeatChunkCount : totalChunks;
  const costChunkTexts = useChunksStore(
    useShallow((state) => state.chunks.map((chunk) => chunk.sourceProcessingText)),
  );
  const currentChunk = useChunksStore(
    useShallow((state) => {
      const chunk = state.chunks.find((entry) => entry.id === selectedChunkId);
      return chunk
        ? {
            id: chunk.id,
            hasSourceText: chunk.sourceProcessingText.trim().length > 0,
            sourceText: chunk.sourceProcessingText,
            totalInputTokens: chunk.totalInputTokens ?? 0,
            totalOutputTokens: chunk.totalOutputTokens ?? 0,
            totalUsd: chunk.totalUsd ?? 0,
          }
        : null;
    }),
  );
  const operationLogEntries = useOperationLogStore((state) => state.entries);
  // Il numero mostrato viene dal contatore ridondante sul frammento (sempre
  // presente, aggiornato ad ogni chiamata riuscita) — non dal join coi log,
  // che serve solo per il dettaglio nel popover e può disconnettersi se il
  // frammento viene ri-suddiviso.
  const currentChunkUsage = currentChunk
    ? summarizeChunkUsage(operationLogEntries, currentChunk.id, pricingOverrides)
    : null;
  const currentChunkTokens = currentChunk
    ? currentChunk.totalInputTokens + currentChunk.totalOutputTokens
    : 0;
  const currentChunkUsd = currentChunk?.totalUsd ?? 0;
  const hasCurrentChunkUsage = currentChunkTokens > 0 || currentChunkUsd > 0;

  const [showCostPanel, setShowCostPanel] = useState(false);
  const costButtonRef = useRef<HTMLDivElement | null>(null);
  const costPanelCloseTimer = useRef<number | null>(null);

  const pipelineCostEstimate = useMemo(
    () => estimatePipelineCost(
      costChunkTexts.slice(0, runChunkCount).map((sourceText) => ({ sourceText })),
      config,
      pricingOverrides,
    ),
    [costChunkTexts, runChunkCount, config, pricingOverrides],
  );
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

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 text-xs">
      {runActionCostEstimate.stages.length > 0 && (
        <div
          ref={costButtonRef}
          className="flex w-fit min-w-0 cursor-default items-center gap-1.5 text-editorial-muted"
          onMouseEnter={openCostPanel}
          onMouseLeave={scheduleCloseCostPanel}
        >
          <CircleDollarSign size={12} className="shrink-0" />
          <span className="truncate">
            {runActionCostEstimate.isFree
              ? t('cost.free')
              : runActionCostEstimate.totalUsd === null
                ? t('cost.unknown')
                : formatCost(runActionCostEstimate.totalUsd)}
          </span>
        </div>
      )}
      {currentChunk && (
        <Popover
          side="bottom"
          align="start"
          className="w-72 px-3"
          trigger={
            <div
              className={`flex w-fit min-w-0 cursor-default items-center gap-1.5 ${
                hasCurrentChunkUsage ? 'text-editorial-accent' : 'text-editorial-muted'
              }`}
            >
              <Coins size={12} className="shrink-0" />
              <span className="truncate">
                {currentChunkTokens.toLocaleString()} · {formatUsd(currentChunkUsd)}
              </span>
            </div>
          }
        >
          {currentChunkUsage && currentChunkUsage.scopeBreakdown.length > 0 ? (
            <ScopeBreakdownCarousel entries={currentChunkUsage.scopeBreakdown} title={t('cost.breakdown')} />
          ) : (
            <p className="py-4 text-center text-xs text-editorial-muted">{t('cost.unknown')}</p>
          )}
        </Popover>
      )}
      <SidebarCostPanel
        anchorRef={costButtonRef}
        estimate={runActionCostEstimate}
        open={showCostPanel && runActionCostEstimate.stages.length > 0}
        onMouseEnter={openCostPanel}
        onMouseLeave={scheduleCloseCostPanel}
      />
    </div>
  );
}
