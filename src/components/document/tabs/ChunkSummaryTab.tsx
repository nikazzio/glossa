import { BarChart2, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { usePricingStore } from '../../../stores/pricingStore';
import { useOperationLogStore } from '../../../stores/operationLogStore';
import {
  formatCacheHitRate,
  formatDurationMs,
  formatUsd,
  summarizeGlobalUsage,
  summarizeChunkUsage,
  type OperationLogRunSummary,
} from '../../../utils/operationLogStats';
import { formatDateTime } from '../../../utils';
import type { TranslationChunk } from '../../../types';
import { StatRow } from '../../ui/StatRow';

function RunSummaryCard({
  title,
  emptyLabel,
  run,
}: {
  title: string;
  emptyLabel: string;
  run: OperationLogRunSummary | null;
}) {
  const { t } = useTranslation();

  return (
    <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
        <Cpu size={11} className="text-editorial-accent shrink-0" /> {title}
      </div>
      {!run ? (
        <p className="text-xs leading-relaxed text-editorial-muted">{emptyLabel}</p>
      ) : (
        <dl className="space-y-2">
          <StatRow label={t('document.summaryWhen')} value={formatDateTime(run.at)} />
          {run.stageName ? <StatRow label={t('document.summaryStage')} value={run.stageName} /> : null}
          <StatRow label={t('document.summaryModel')} value={[run.provider, run.model].filter(Boolean).join(' / ') || '—'} />
          <StatRow label={t('document.summaryTokens')} value={(run.stats.totalInput + run.stats.totalOutput).toLocaleString()} />
          <StatRow label={t('document.summaryCached')} value={run.stats.totalCached.toLocaleString()} />
          <StatRow label={t('header.cacheHitRate')} value={formatCacheHitRate(run.stats.cacheHitRate)} />
          <StatRow label={t('document.summaryMiss')} value={run.stats.totalCacheMiss.toLocaleString()} />
          <StatRow label={t('log.totalDuration')} value={run.stats.totalDurationMs > 0 ? formatDurationMs(run.stats.totalDurationMs) : '—'} />
        </dl>
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

      <RunSummaryCard
        title={t('document.chunkSummaryLastTranslation')}
        emptyLabel={t('document.chunkSummaryNoTranslation')}
        run={chunkSummary.lastTranslationRun}
      />

      <RunSummaryCard
        title={t('document.chunkSummaryLastAudit')}
        emptyLabel={t('document.chunkSummaryNoAudit')}
        run={chunkSummary.lastAuditRun}
      />
    </div>
  );
}
