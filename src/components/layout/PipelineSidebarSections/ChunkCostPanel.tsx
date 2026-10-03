import { CircleDollarSign, Coins } from 'lucide-react';
import { useMemo } from 'react';
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
import { IconButton, Popover, ScopeBreakdownCarousel } from '../../ui';

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

  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-xs">
      {runActionCostEstimate.stages.length > 0 && (
        <Popover side="left" align="start" className="w-72 p-3" trigger={
          <span className="flex min-w-0 items-center gap-1 text-editorial-muted">
            <IconButton title={t('cost.estimateDetails')}><CircleDollarSign size={14} /></IconButton>
            <span className="truncate">
              {runActionCostEstimate.isFree ? t('cost.free') : runActionCostEstimate.totalUsd === null
                ? t('cost.unknown') : formatCost(runActionCostEstimate.totalUsd)}
            </span>
          </span>
        }>
          <CostBreakdownPanel estimate={runActionCostEstimate} />
        </Popover>
      )}
      {/* Stima a sinistra, consumo a destra, ognuna larga quanto la sua
          scritta: il passaggio del mouse apre il dettaglio solo lì sopra. */}
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
              <IconButton title={t('cost.actualDetails')}><Coins size={14} /></IconButton>
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

    </div>
  );
}
