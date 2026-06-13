import {
  AlertCircle,
  BarChart2,
  CheckCircle2,
  Circle,
  Cpu,
  FileText,
  FlaskConical,
  Gauge,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { usePricingStore } from '../../../stores/pricingStore';
import { useOperationLogStore } from '../../../stores/operationLogStore';
import { countWords, qualityLabelKey, qualityTone, calculateCompositeQuality } from '../../../utils';
import {
  formatCacheHitRate,
  formatDurationMs,
  formatUsd,
  summarizeGlobalUsage,
  type ScopeBreakdownEntry,
} from '../../../utils/operationLogStats';
import type { TranslationChunk } from '../../../types';
import { StatRow } from '../../ui/StatRow';

const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-accent',
};

const TOP_SCOPE_I18N_KEYS = new Set(['log.scopeAudit', 'log.scopeCoherence']);

function ScopeBreakdownCard({ entry }: { entry: ScopeBreakdownEntry }) {
  const { t } = useTranslation();
  const { labelKey, model, stats } = entry;
  const label = TOP_SCOPE_I18N_KEYS.has(labelKey) ? t(labelKey) : labelKey;
  const totalTok = stats.totalInput + stats.totalOutput;
  return (
    <div className="rounded-xl border border-editorial-border/70 bg-editorial-textbox/40 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-sans uppercase tracking-[0.12em] text-editorial-muted">{label}</span>
        <span className="shrink-0 font-display text-sm italic text-editorial-ink">{totalTok.toLocaleString()} tok</span>
      </div>
      {model && (
        <div className="mt-0.5 truncate font-mono text-[11px] text-editorial-muted">{model}</div>
      )}
      <dl className="mt-2 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{t('header.cacheHitRate')}</dt>
          <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{formatCacheHitRate(stats.cacheHitRate)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] font-sans uppercase tracking-[0.1em] text-editorial-muted">{t('header.estimatedCost')}</dt>
          <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{formatUsd(stats.totalUsd)}</dd>
        </div>
      </dl>
    </div>
  );
}

export interface StatsTabProps {
  panelId: string;
  labelledBy: string;
  chunks: TranslationChunk[];
}

export function StatsTab({ panelId, labelledBy, chunks }: StatsTabProps) {
  const { t } = useTranslation();
  const pricingOverrides = usePricingStore((s) => s.overrides);
  const logEntries = useOperationLogStore((s) => s.entries);
  const usageSummary = useMemo(
    () => summarizeGlobalUsage(logEntries, pricingOverrides),
    [logEntries, pricingOverrides],
  );

  const sourceWords = chunks.reduce((acc, c) => acc + countWords(c.originalText), 0);
  const translatedWords = chunks.reduce((acc, c) => acc + countWords(c.currentDraft || ''), 0);
  const coverageRatio = sourceWords > 0 ? Math.round((translatedWords / sourceWords) * 100) : 0;
  const total = chunks.length;
  const idleCount = chunks.filter((c) => c.status === 'ready').length;
  const processingCount = chunks.filter((c) => c.status === 'processing').length;
  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const previewCount = chunks.filter((c) => c.status === 'preview').length;
  const errorCount = chunks.filter((c) => c.status === 'error').length;
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const compositeQuality = calculateCompositeQuality(chunks);
  const compositeLabel = compositeQuality ? t(qualityLabelKey(compositeQuality)) : null;
  const compositeTone = qualityTone(compositeQuality);
  const totalTokens = usageSummary.overall.totalInput + usageSummary.overall.totalOutput;
  const hasPersistedUsage =
    totalTokens > 0
    || usageSummary.overall.totalCached > 0
    || usageSummary.overall.totalDurationMs > 0
    || usageSummary.translationRuns > 0
    || usageSummary.auditRuns > 0
    || usageSummary.coherenceRuns > 0;

  if (chunks.length === 0) {
    return (
      <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <BarChart2 size={28} className="text-editorial-border" />
        <p className="text-sm font-medium text-editorial-muted">{t('document.indexEmptyTitle')}</p>
        <p className="text-xs leading-relaxed text-editorial-muted">{t('document.indexEmptyBody')}</p>
      </div>
    );
  }

  return (
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className="space-y-3 px-5 py-5">
      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
          <FileText size={11} className="text-editorial-accent shrink-0" /> {t('document.infoLabel')}
        </div>
        <dl className="space-y-2">
          <StatRow label={t('document.infoSourceWords')} value={sourceWords.toLocaleString()} />
          <StatRow label={t('document.infoTranslatedWords')} value={`${translatedWords.toLocaleString()} (${coverageRatio}%)`} />
          <StatRow label={t('document.infoChunks')} value={`${completedCount} / ${total}`} />
        </dl>
      </section>

      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
          <BarChart2 size={11} className="text-editorial-accent shrink-0" /> {t('pipeline.chunkStatus.completed')}
        </div>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-editorial-border/40">
          <div className="h-full rounded-full bg-editorial-success transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="mb-2 font-display text-lg italic text-editorial-ink">{progressPct}%</div>
        <div className="flex flex-wrap gap-3">
          {idleCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-muted"><Circle size={10} className="text-editorial-muted/70" /><span className="font-bold">{idleCount}</span> {t('pipeline.chunkStatus.ready')}</div>}
          {processingCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-warning"><Loader2 size={10} className="animate-spin" /><span className="font-bold">{processingCount}</span> {t('pipeline.chunkStatus.processing')}</div>}
          {previewCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-muted"><FlaskConical size={10} /><span className="font-bold">{previewCount}</span> {t('pipeline.chunkStatus.preview')}</div>}
          {completedCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-success"><CheckCircle2 size={10} /><span className="font-bold">{completedCount}</span> {t('pipeline.chunkStatus.completed')}</div>}
          {errorCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-accent"><AlertCircle size={10} /><span className="font-bold">{errorCount}</span> {t('pipeline.chunkStatus.error')}</div>}
        </div>
      </section>

      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
          <Gauge size={11} className="text-editorial-accent shrink-0" /> {t('document.infoQuality')}
        </div>
        {compositeLabel
          ? <div className={`font-display text-lg italic ${QUALITY_TONE_COLOR[compositeTone]}`}>{compositeLabel}</div>
          : <div className="font-display text-lg italic text-editorial-muted/40">—</div>}
      </section>

      <section className="rounded-[20px] border border-editorial-border bg-editorial-bg px-4 py-3">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
          <Cpu size={11} className="text-editorial-accent shrink-0" /> {t('header.tokenCount')}
        </div>
        <dl className="space-y-2">
          <StatRow
            label={t('header.tokenCount')}
            value={totalTokens > 0 ? totalTokens.toLocaleString() : '—'}
          />
          {totalTokens > 0 && (
            <div className="flex items-baseline gap-1.5 pl-3">
              <dt className="text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">in</dt>
              <dd className="font-display text-sm italic text-editorial-muted">{usageSummary.overall.totalInput.toLocaleString()}</dd>
              <dt className="ml-2 text-[11px] font-bold uppercase tracking-[0.1em] text-editorial-muted">out</dt>
              <dd className="font-display text-sm italic text-editorial-muted">{usageSummary.overall.totalOutput.toLocaleString()}</dd>
            </div>
          )}
          {(usageSummary.overall.totalCached > 0 || usageSummary.overall.totalCacheMiss > 0) && (
            <>
              <StatRow label={t('header.cachedInput')} value={usageSummary.overall.totalCached.toLocaleString()} />
              <StatRow label={t('header.cacheHitRate')} value={formatCacheHitRate(usageSummary.overall.cacheHitRate)} />
              {usageSummary.overall.totalCacheMiss > 0 && (
                <StatRow label={t('header.cacheMissInput')} value={usageSummary.overall.totalCacheMiss.toLocaleString()} />
              )}
            </>
          )}
          <StatRow label={t('header.estimatedCost')} value={formatUsd(usageSummary.overall.totalUsd)} />
          <StatRow label={t('log.totalDuration')} value={usageSummary.overall.totalDurationMs > 0 ? formatDurationMs(usageSummary.overall.totalDurationMs) : '—'} />
          <StatRow label={t('document.summaryTranslationRuns')} value={usageSummary.translationRuns.toLocaleString()} />
          <StatRow label={t('document.summaryAuditRuns')} value={usageSummary.auditRuns.toLocaleString()} />
          <StatRow label={t('document.summaryCoherenceRuns')} value={usageSummary.coherenceRuns.toLocaleString()} />
        </dl>
        {!hasPersistedUsage && (
          <p className="mt-3 text-xs leading-relaxed text-editorial-muted">
            {t('document.summaryNoPersistedStats')}
          </p>
        )}
        {usageSummary.scopeBreakdown.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-sans uppercase tracking-[0.16em] text-editorial-muted">
              {t('document.summaryStageBreakdown')}
            </div>
            {usageSummary.scopeBreakdown.map((entry) => (
              <ScopeBreakdownCard key={`${entry.scope}-${entry.stageId ?? entry.labelKey}`} entry={entry} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
