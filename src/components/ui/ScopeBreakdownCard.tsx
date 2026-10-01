import { useTranslation } from 'react-i18next';
import {
  formatCacheHitRate,
  formatDurationMs,
  formatUsd,
  type ScopeBreakdownEntry,
} from '../../utils/operationLogStats';

interface ScopeBreakdownCardProps {
  entry: ScopeBreakdownEntry;
}

export function ScopeBreakdownCard({ entry }: ScopeBreakdownCardProps) {
  const { t } = useTranslation();
  const { labelKey, model, stats } = entry;
  const label = labelKey.startsWith('log.') ? t(labelKey) : labelKey;
  const totalTok = stats.totalInput + stats.totalOutput;
  return (
    <div className="rounded-xl border border-rule bg-editorial-textbox/40 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-sans uppercase tracking-caption text-editorial-muted">{label}</span>
        <span className="shrink-0 font-display text-sm italic text-editorial-ink">{totalTok.toLocaleString()} tok</span>
      </div>
      {model && (
        <div className="mt-0.5 truncate font-mono text-xs text-editorial-muted">{model}</div>
      )}
      <dl className="mt-2 space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="caption-label">{t('header.cacheHitRate')}</dt>
          <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{formatCacheHitRate(stats.cacheHitRate)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="caption-label">{t('header.estimatedCost')}</dt>
          <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{formatUsd(stats.totalUsd)}</dd>
        </div>
        {stats.totalDurationMs > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="caption-label">{t('log.totalDuration')}</dt>
            <dd className="shrink-0 font-display text-sm italic text-editorial-ink">{formatDurationMs(stats.totalDurationMs)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
