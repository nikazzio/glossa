import { BarChart2, ChevronLeft, ChevronRight, Cpu, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { usePricingStore } from '../../../stores/pricingStore';
import { useOperationLogStore } from '../../../stores/operationLogStore';
import {
  formatCacheHitRate,
  formatDurationMs,
  formatUsd,
  summarizeChunkUsage,
  listRunsForCategory,
  type OperationLogRunSummary,
} from '../../../utils/operationLogStats';
import { formatDateTime } from '../../../utils';
import type { TranslationChunk } from '../../../types';
import { StatRow, ScopeBreakdownCarousel, Tooltip } from '../../ui';

function SectionHeader({ icon, label, info }: { icon: React.ReactNode; label: string; info?: string }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
      <span className="text-editorial-accent shrink-0">{icon}</span>
      {label}
      {info && (
        <Tooltip label={info} side="right">
          <span className="ml-0.5 inline-flex cursor-help rounded-full p-0.5 text-editorial-muted/60 hover:text-editorial-muted">
            <Info size={11} />
          </span>
        </Tooltip>
      )}
    </div>
  );
}

function RunStepsCard({
  title,
  emptyLabel,
  runs,
  titleInfo,
}: {
  title: string;
  emptyLabel: string;
  runs: OperationLogRunSummary[];
  titleInfo?: string;
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
        <SectionHeader icon={<Cpu size={11} />} label={title} info={titleInfo} />
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
            <StatRow
              label={t('header.cacheHitRate')}
              value={formatCacheHitRate(run.stats.cacheHitRate)}
              info={t('stats.cacheHitRateHint')}
            />
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
  const chunkSummary = useMemo(
    () => (currentChunk ? summarizeChunkUsage(logEntries, currentChunk.id, pricingOverrides) : null),
    [currentChunk, logEntries, pricingOverrides],
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
        <SectionHeader
          icon={<BarChart2 size={11} />}
          label={t('document.chunkSummaryTotals')}
          info={t('stats.chunkTotalsHint')}
        />
        <dl className="space-y-2">
          <StatRow label={t('header.tokenCount')} value={totalTokens > 0 ? totalTokens.toLocaleString() : '—'} />
          <StatRow label={t('header.cachedInput')} value={chunkSummary.total.totalCached.toLocaleString()} />
          <StatRow
            label={t('header.cacheHitRate')}
            value={formatCacheHitRate(chunkSummary.total.cacheHitRate)}
            info={t('stats.cacheHitRateHint')}
          />
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
      </section>

      {chunkSummary.scopeBreakdown.length > 0 && (
        <ScopeBreakdownCarousel
          entries={chunkSummary.scopeBreakdown}
          title={t('document.summaryStageBreakdown')}
        />
      )}

      <RunStepsCard
        key={`tr-${currentChunk.id}`}
        title={t('document.chunkSummaryLastTranslation')}
        emptyLabel={t('document.chunkSummaryNoTranslation')}
        runs={translationSteps}
        titleInfo={t('stats.lastRunHint')}
      />

      <RunStepsCard
        key={`au-${currentChunk.id}`}
        title={t('document.chunkSummaryLastAudit')}
        emptyLabel={t('document.chunkSummaryNoAudit')}
        runs={auditSteps}
        titleInfo={t('stats.lastRunHint')}
      />
    </div>
  );
}
