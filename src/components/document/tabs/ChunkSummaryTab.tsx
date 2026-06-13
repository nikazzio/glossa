import { BarChart2, ChevronLeft, ChevronRight, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { usePricingStore } from '../../../stores/pricingStore';
import { useOperationLogStore } from '../../../stores/operationLogStore';
import {
  formatCacheHitRate,
  formatDurationMs,
  formatUsd,
  summarizeGlobalUsage,
  summarizeChunkUsage,
  listRunsForCategory,
  type OperationLogRunSummary,
} from '../../../utils/operationLogStats';
import { formatDateTime } from '../../../utils';
import type { TranslationChunk } from '../../../types';
import { StatRow } from '../../ui/StatRow';

// Carosello sugli step registrati (traduzione → refine → format, oppure i passi di audit).
// I dati riflettono solo l'ultima esecuzione: rilanciare il chunk azzera il log precedente.
function RunStepsCard({
  title,
  emptyLabel,
  runs,
}: {
  title: string;
  emptyLabel: string;
  runs: OperationLogRunSummary[];
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(() => Math.max(0, runs.length - 1));
  const safeIndex = Math.min(index, Math.max(0, runs.length - 1));
  const run = runs[safeIndex] ?? null;
  const multi = runs.length > 1;
  const stepLabel = run?.stageName ?? t('document.summaryStepFallback');

  return (
    <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
          <Cpu size={11} className="text-editorial-accent shrink-0" /> {title}
        </div>
        {multi && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0}
              aria-label={t('document.summaryPrevStep')}
              className="rounded-full border border-editorial-border p-1 text-editorial-muted transition-colors enabled:hover:border-editorial-accent/60 enabled:hover:text-editorial-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-display text-[12px] italic tabular-nums text-editorial-ink">{safeIndex + 1}/{runs.length}</span>
            <button
              type="button"
              onClick={() => setIndex(Math.min(runs.length - 1, safeIndex + 1))}
              disabled={safeIndex === runs.length - 1}
              aria-label={t('document.summaryNextStep')}
              className="rounded-full border border-editorial-border p-1 text-editorial-muted transition-colors enabled:hover:border-editorial-accent/60 enabled:hover:text-editorial-accent disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      {!run ? (
        <p className="text-xs leading-relaxed text-editorial-muted">{emptyLabel}</p>
      ) : (
        <>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-accent">{stepLabel}</span>
            <span className="shrink-0 font-display text-[12px] italic text-editorial-muted">{formatDateTime(run.at)}</span>
          </div>
          <dl className="space-y-2">
            <StatRow label={t('document.summaryModel')} value={[run.provider, run.model].filter(Boolean).join(' / ') || '—'} />
            <StatRow label={t('document.summaryTokens')} value={(run.stats.totalInput + run.stats.totalOutput).toLocaleString()} />
            <StatRow label={t('document.summaryCached')} value={run.stats.totalCached.toLocaleString()} />
            <StatRow label={t('header.cacheHitRate')} value={formatCacheHitRate(run.stats.cacheHitRate)} />
            <StatRow label={t('document.summaryMiss')} value={run.stats.totalCacheMiss.toLocaleString()} />
            <StatRow label={t('header.estimatedCost')} value={formatUsd(run.stats.totalUsd)} />
            <StatRow label={t('log.totalDuration')} value={run.stats.totalDurationMs > 0 ? formatDurationMs(run.stats.totalDurationMs) : '—'} />
          </dl>
          <p className="mt-3 text-[11px] leading-relaxed text-editorial-muted">{t('document.summaryLatestRunOnly')}</p>
        </>
      )}
    </section>
  );
}

export interface ChunkSummaryTabProps {
  panelId: string;
  labelledBy: string;
  currentChunk: TranslationChunk | null;
}

export function ChunkSummaryTab({ panelId, labelledBy, currentChunk }: ChunkSummaryTabProps) {
  const { t } = useTranslation();
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const logEntries = useOperationLogStore((s) => s.entries);
  const chunkEntries = useMemo(
    () => (currentChunk ? logEntries.filter((entry) => entry.chunkId === currentChunk.id) : []),
    [currentChunk, logEntries],
  );
  const chunkSummary = useMemo(
    () => (currentChunk ? summarizeChunkUsage(logEntries, currentChunk.id, pricingOverrides) : null),
    [currentChunk, logEntries, pricingOverrides],
  );
  const chunkBreakdown = useMemo(
    () => summarizeGlobalUsage(chunkEntries, pricingOverrides).scopeBreakdown,
    [chunkEntries, pricingOverrides],
  );
  const translationSteps = useMemo(
    () => (currentChunk ? listRunsForCategory(logEntries, currentChunk.id, 'translation', pricingOverrides) : []),
    [currentChunk, logEntries, pricingOverrides],
  );
  const auditSteps = useMemo(
    () => (currentChunk ? listRunsForCategory(logEntries, currentChunk.id, 'audit', pricingOverrides) : []),
    [currentChunk, logEntries, pricingOverrides],
  );

  if (!currentChunk || !chunkSummary) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="px-6 py-8 text-sm text-editorial-muted">
        {t('document.insightsSummaryEmpty')}
      </div>
    );
  }

  const totalTokens = chunkSummary.total.totalInput + chunkSummary.total.totalOutput;
  const hasPersistedUsage =
    totalTokens > 0
    || chunkSummary.total.totalCached > 0
    || chunkSummary.total.totalDurationMs > 0
    || chunkSummary.translationRuns > 0
    || chunkSummary.auditRuns > 0
    || chunkSummary.coherenceRuns > 0;

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="space-y-3 px-5 py-5">
      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
          <BarChart2 size={11} className="text-editorial-accent shrink-0" /> {t('document.chunkSummaryTotals')}
        </div>
        <dl className="space-y-2">
          <StatRow label={t('header.tokenCount')} value={totalTokens > 0 ? totalTokens.toLocaleString() : '—'} />
          <StatRow label={t('header.cachedInput')} value={chunkSummary.total.totalCached.toLocaleString()} />
          <StatRow label={t('header.cacheHitRate')} value={formatCacheHitRate(chunkSummary.total.cacheHitRate)} />
          <StatRow label={t('header.estimatedCost')} value={formatUsd(chunkSummary.total.totalUsd)} />
          <StatRow label={t('log.totalDuration')} value={chunkSummary.total.totalDurationMs > 0 ? formatDurationMs(chunkSummary.total.totalDurationMs) : '—'} />
          <StatRow label={t('document.summaryTranslationRuns')} value={chunkSummary.translationRuns.toLocaleString()} />
          <StatRow label={t('document.summaryAuditRuns')} value={chunkSummary.auditRuns.toLocaleString()} />
          <StatRow label={t('document.summaryCoherenceRuns')} value={chunkSummary.coherenceRuns.toLocaleString()} />
        </dl>
        {!hasPersistedUsage && (
          <p className="mt-3 text-xs leading-relaxed text-editorial-muted">
            {t('document.summaryNoPersistedStats')}
          </p>
        )}
        {chunkBreakdown.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
              {t('document.summaryStageBreakdown')}
            </div>
            {chunkBreakdown.map((entry) => (
              <div
                key={`${entry.scope}-${entry.stageId ?? entry.labelKey}`}
                className="rounded-xl border border-editorial-border/70 bg-editorial-textbox/40 px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-sans uppercase tracking-[0.12em] text-editorial-muted">
                    {entry.labelKey.startsWith('log.') ? t(entry.labelKey) : entry.labelKey}
                  </span>
                  <span className="shrink-0 font-display text-sm italic text-editorial-ink">
                    {(entry.stats.totalInput + entry.stats.totalOutput).toLocaleString()} tok
                  </span>
                </div>
                <dl className="mt-2 space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{t('header.cacheHitRate')}</dt>
                    <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{formatCacheHitRate(entry.stats.cacheHitRate)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{t('header.estimatedCost')}</dt>
                    <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{formatUsd(entry.stats.totalUsd)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{t('log.totalDuration')}</dt>
                    <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{entry.stats.totalDurationMs > 0 ? formatDurationMs(entry.stats.totalDurationMs) : '—'}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        )}
      </section>

      <RunStepsCard
        key={`tr-${currentChunk.id}`}
        title={t('document.chunkSummaryLastTranslation')}
        emptyLabel={t('document.chunkSummaryNoTranslation')}
        runs={translationSteps}
      />

      <RunStepsCard
        key={`au-${currentChunk.id}`}
        title={t('document.chunkSummaryLastAudit')}
        emptyLabel={t('document.chunkSummaryNoAudit')}
        runs={auditSteps}
      />
    </div>
  );
}
