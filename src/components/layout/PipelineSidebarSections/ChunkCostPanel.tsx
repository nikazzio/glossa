import { CircleDollarSign, Coins, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { CostTable, estimateRows, formatCost, usageRows } from '../../pipeline/CostTable';
import { ClickPopover, SectionLabel } from '../../ui';

/**
 * Stima del prossimo lancio e consumo reale del frammento aperto, in una riga
 * sotto i comandi di esecuzione. Un clic apre un solo pannello con le due
 * tabelle per fase: restano separate, perché stima e consumo non sono
 * confrontabili riga per riga.
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
  const estimateScope = workMode === 'chunk'
    ? t('cost.scopeChunk')
    : isLimitedRun ? t('cost.scopeFirstChunks', { count: runChunkCount }) : t('cost.scopeDocument');
  const estimateTotal = runActionCostEstimate.isFree ? t('cost.free') : runActionCostEstimate.totalUsd === null
    ? t('cost.unknown') : formatCost(runActionCostEstimate.totalUsd);
  const hasEstimate = runActionCostEstimate.stages.length > 0;
  const estimateTableRows = estimateRows(runActionCostEstimate, t('cost.free'), t('cost.unknown'));
  const usageTableRows = currentChunkUsage ? usageRows(currentChunkUsage.scopeBreakdown, t) : [];
  const [open, setOpen] = useState(false);

  if (!hasEstimate && !currentChunk) return null;

  return (
    // Un solo comando, senza suggerimento al passaggio: le cifre si leggono
    // già, e un clic apre il pannello con il dettaglio di stima e consumo.
    <ClickPopover open={open} onOpenChange={setOpen} side="left" align="start" className="w-[26rem] max-w-[90vw]"
      trigger={
        <button type="button" aria-pressed={open} aria-label={t('cost.panelTitle')}
          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md py-1 text-xs text-editorial-muted transition-colors hover:text-editorial-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent">
          {hasEstimate && (
            <span className="flex min-w-0 items-center gap-1.5">
              <CircleDollarSign size={13} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{t('cost.estimateShort')} <span className="tabular-nums text-editorial-ink">{estimateTotal}</span></span>
            </span>
          )}
          {currentChunk && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Coins size={13} className="shrink-0" aria-hidden="true" />
              <span className="truncate">
                {t('cost.spentShort')}{' '}
                <span className="tabular-nums text-editorial-ink">{currentChunkTokens.toLocaleString()} tok · {formatUsd(currentChunkUsd)}</span>
              </span>
            </span>
          )}
        </button>
      }>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
        {hasEstimate && (
          <section className="space-y-2">
            <PanelHeading icon={CircleDollarSign} title={t('cost.estimateTitle')} scope={estimateScope} />
            <CostTable rows={estimateTableRows}
              total={{ tokens: estimateTableRows.reduce((sum, row) => sum + row.tokens, 0), cost: estimateTotal }} />
          </section>
        )}
        {currentChunk && (
          <section className="space-y-2">
            <PanelHeading icon={Coins} title={t('cost.spentTitle')} />
            {usageTableRows.length > 0 && currentChunkUsage ? (
              <CostTable showCalls rows={usageTableRows}
                total={{ tokens: currentChunkUsage.total.totalInput + currentChunkUsage.total.totalOutput, cost: formatUsd(currentChunkUsage.total.totalUsd) }} />
            ) : (
              <p className="text-xs text-editorial-muted">{t('cost.noUsage')}</p>
            )}
          </section>
        )}
      </div>
    </ClickPopover>
  );
}

/** Titolo di sezione: nessun suggerimento, il pannello è già un riquadro aperto. */
function PanelHeading({ icon, title, scope }: { icon: LucideIcon; title: string; scope?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-rule pb-1.5">
      <SectionLabel icon={icon} label={title} />
      {scope && <span className="truncate font-display text-xs italic text-editorial-ink">{scope}</span>}
    </div>
  );
}
