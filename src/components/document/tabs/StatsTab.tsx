import {
  AlertCircle,
  BarChart2,
  CheckCircle2,
  Circle,
  Cpu,
  FileText,
  Gauge,
  Layers,
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
} from '../../../utils/operationLogStats';
import type { TranslationChunk } from '../../../types';
import { PANEL_BODY_CLASSNAME, PanelSection, StatRow } from '../../ui';
import { CostTable, usageRows } from '../../pipeline/CostTable';


const QUALITY_TONE_COLOR: Record<ReturnType<typeof qualityTone>, string> = {
  strong: 'text-editorial-success',
  ok: 'text-editorial-warning',
  weak: 'text-editorial-danger',
};

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

  const sourceWords = chunks.reduce((acc, c) => acc + countWords(c.sourceDisplayText), 0);
  const translatedWords = chunks.reduce((acc, c) => acc + countWords(c.translationDisplayText), 0);
  const coverageRatio = sourceWords > 0 ? Math.round((translatedWords / sourceWords) * 100) : 0;
  const total = chunks.length;
  const idleCount = chunks.filter((c) => c.status === 'ready').length;
  const processingCount = chunks.filter((c) => c.status === 'processing').length;
  const completedCount = chunks.filter((c) => c.status === 'completed').length;
  const errorCount = chunks.filter((c) => c.status === 'error').length;
  const progressPct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const compositeQuality = calculateCompositeQuality(chunks);
  const compositeLabel = compositeQuality ? t(qualityLabelKey(compositeQuality)) : null;
  const compositeTone = qualityTone(compositeQuality);
  const totalTokens = usageSummary.overall.totalInput + usageSummary.overall.totalOutput;
  const hasPersistedUsage =
    totalTokens > 0
    || usageSummary.overall.totalCached > 0
    || usageSummary.overall.totalDurationMs > 0;

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
    <div id={panelId} role="tabpanel" aria-labelledby={labelledBy} className={PANEL_BODY_CLASSNAME}>
      <PanelSection icon={FileText} label={t('document.infoLabel')}>
        <dl className="space-y-2">
          <StatRow label={t('document.infoSourceWords')} value={sourceWords.toLocaleString()} />
          <StatRow label={t('document.infoTranslatedWords')} value={`${translatedWords.toLocaleString()} (${coverageRatio}%)`} />
          <StatRow label={t('document.infoChunks')} value={`${completedCount} / ${total}`} />
        </dl>
      </PanelSection>

      <PanelSection icon={BarChart2} label={t('pipeline.chunkStatus.completed')}>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-rule-faint">
          <div className="h-full rounded-full bg-editorial-success transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="font-display text-lg italic text-editorial-ink">{progressPct}%</div>
        <div className="flex flex-wrap gap-3">
          {idleCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-muted"><Circle size={10} className="text-editorial-muted" /><span className="font-bold">{idleCount}</span> {t('pipeline.chunkStatus.ready')}</div>}
          {processingCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-warning"><Loader2 size={10} className="animate-spin" /><span className="font-bold">{processingCount}</span> {t('pipeline.chunkStatus.processing')}</div>}
          {completedCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-success"><CheckCircle2 size={10} /><span className="font-bold">{completedCount}</span> {t('pipeline.chunkStatus.completed')}</div>}
          {errorCount > 0 && <div className="flex items-center gap-1.5 text-xs text-editorial-danger"><AlertCircle size={10} /><span className="font-bold">{errorCount}</span> {t('pipeline.chunkStatus.error')}</div>}
        </div>
      </PanelSection>

      <PanelSection icon={Gauge} label={t('document.infoQuality')} hint={t('stats.qualityHint')}>
        {compositeLabel
          ? <div className={`font-display text-lg italic ${QUALITY_TONE_COLOR[compositeTone]}`}>{compositeLabel}</div>
          : <div className="font-display text-lg italic text-editorial-muted">—</div>}
      </PanelSection>

      <PanelSection icon={Cpu} label={t('header.tokenCount')} hint={t('stats.tokenTotalsHint')}>
        <dl className="space-y-2">
          <StatRow
            label={t('header.tokenCount')}
            value={totalTokens > 0 ? totalTokens.toLocaleString() : '—'}
          />
          {totalTokens > 0 && (
            <div className="flex items-baseline gap-1.5 pl-3">
              <dt className="text-caption font-bold uppercase tracking-caption text-editorial-muted">in</dt>
              <dd className="font-display text-sm italic text-editorial-muted">{usageSummary.overall.totalInput.toLocaleString()}</dd>
              <dt className="ml-2 text-caption font-bold uppercase tracking-caption text-editorial-muted">out</dt>
              <dd className="font-display text-sm italic text-editorial-muted">{usageSummary.overall.totalOutput.toLocaleString()}</dd>
            </div>
          )}
          {(usageSummary.overall.totalCached > 0 || usageSummary.overall.totalCacheMiss > 0) && (
            <>
              <StatRow label={t('header.cachedInput')} value={usageSummary.overall.totalCached.toLocaleString()} />
              <StatRow
                label={t('header.cacheHitRate')}
                value={formatCacheHitRate(usageSummary.overall.cacheHitRate)}
                info={t('stats.cacheHitRateHint')}
              />
              {usageSummary.overall.totalCacheMiss > 0 && (
                <StatRow label={t('header.cacheMissInput')} value={usageSummary.overall.totalCacheMiss.toLocaleString()} />
              )}
            </>
          )}
          <StatRow label={t('header.estimatedCost')} value={formatUsd(usageSummary.overall.totalUsd)} />
          <StatRow label={t('log.totalDuration')} value={usageSummary.overall.totalDurationMs > 0 ? formatDurationMs(usageSummary.overall.totalDurationMs) : '—'} />
        </dl>
        {!hasPersistedUsage && (
          <p className="text-xs leading-relaxed text-editorial-muted">
            {t('document.summaryNoPersistedStats')}
          </p>
        )}
      </PanelSection>

      {usageSummary.scopeBreakdown.length > 0 && (
        <PanelSection icon={Layers} label={t('document.summaryStageBreakdown')} hint={t('cost.callsHint')}>
          <CostTable showCalls rows={usageRows(usageSummary.scopeBreakdown, t)}
            total={{ tokens: totalTokens, cost: formatUsd(usageSummary.overall.totalUsd) }} />
        </PanelSection>
      )}
    </div>
  );
}
