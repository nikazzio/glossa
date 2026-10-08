import { Coins, Database } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RatioEstimate, SpendSummary, TokenSummary } from '../../../utils/dashboardStats';
import { formatUsd } from '../../../utils/operationLogStats';
import { DashboardSection } from '../DashboardSection';
import { StackedColumns, type ColumnSeries } from '../charts/StackedColumns';
import { formatCompact, formatMonth, formatPercent } from '../charts/format';
import { Figure, SectionGate, SeriesLegend, type ResourceState } from './statsCommon';

/** Ultimi mesi mostrati nelle colonne della spesa. */
const SPEND_MONTHS = 12;

/** Spesa del periodo per mese, divisa fra traduzione e OCR, con la proiezione del mese. */
export function SpendSection({ state, spend, month, perThousand }: {
  state: ResourceState;
  spend: SpendSummary;
  month: { spent: number; projected: number | null };
  /** Spesa di traduzione per mille parole, sui frammenti con costo registrato. */
  perThousand: RatioEstimate | null;
}) {
  const { t, i18n } = useTranslation();
  const series: ColumnSeries[] = [
    { key: 'translation', label: t('dashboardStats.spend.translation'), className: 'bg-chart-translations' },
    { key: 'ocr', label: t('dashboardStats.spend.ocr'), className: 'bg-chart-transcriptions' },
  ];
  const months = spend.months.slice(-SPEND_MONTHS);
  return (
    <DashboardSection id="stats-spend" icon={Coins} label={t('dashboardStats.spend.title')} hint={t('dashboardStats.spend.hint')}>
      <SectionGate states={[state]} insufficient={spend.months.length === 0}>
        <div className="grid grid-cols-3 gap-3">
          <Figure value={formatUsd(spend.total)} label={t('dashboardStats.spend.period')} />
          <Figure value={formatUsd(month.spent)} label={t('dashboardStats.spend.month')}
            note={month.projected === null
              ? t('dashboardStats.spend.projectedLater')
              : t('dashboardStats.spend.projected', { cost: formatUsd(month.projected) })} />
          <Figure value={perThousand === null ? '—' : formatUsd(perThousand.value)} label={t('dashboardStats.spend.perThousand')}
            note={perThousand === null
              ? t('dashboardStats.insufficient')
              : perThousand.interval
                ? t('dashboardStats.spend.perThousandRange', {
                  low: formatUsd(perThousand.interval.low),
                  high: formatUsd(perThousand.interval.high),
                  count: perThousand.sample,
                })
                : t('dashboardStats.spend.perThousandSample', { count: perThousand.sample })} />
        </div>
        <StackedColumns
          data={months.map((entry, index) => ({
            key: entry.month,
            label: formatMonth(entry.month, i18n.language, index === 0 || entry.month.endsWith('-01')),
            values: { translation: entry.translation, ocr: entry.ocr },
          }))}
          series={series}
          format={(value) => formatUsd(value)}
          ariaLabel={t('dashboardStats.spend.chart')}
        />
        <SeriesLegend series={series} />
        {spend.unpricedCalls > 0 && (
          <p className="text-xs text-editorial-warning">{t('dashboardStats.spend.unpriced', { count: spend.unpricedCalls })}</p>
        )}
      </SectionGate>
    </DashboardSection>
  );
}

/** Token in ingresso e in uscita, e quanta parte dell'ingresso è arrivata dalla cache. */
export function TokensSection({ state, tokens }: { state: ResourceState; tokens: TokenSummary }) {
  const { t, i18n } = useTranslation();
  const total = tokens.input + tokens.output;
  return (
    <DashboardSection id="stats-tokens" icon={Database} label={t('dashboardStats.tokens.title')} hint={t('dashboardStats.tokens.hint')}>
      <SectionGate states={[state]} insufficient={total === 0}>
        <div className="grid grid-cols-3 gap-3">
          <Figure value={formatCompact(tokens.input, i18n.language)} label={t('dashboardStats.tokens.input')} />
          <Figure value={formatCompact(tokens.output, i18n.language)} label={t('dashboardStats.tokens.output')} />
          <Figure value={tokens.cacheRate === null ? '—' : formatPercent(tokens.cacheRate, i18n.language)}
            label={t('dashboardStats.tokens.cache')}
            note={tokens.cached > 0 ? t('dashboardStats.tokens.cached', { value: formatCompact(tokens.cached, i18n.language) }) : undefined} />
        </div>
        {total > 0 && (
          <span className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded" role="img"
            aria-label={t('dashboardStats.tokens.split', { input: formatPercent(tokens.input / total, i18n.language) })}>
            <span className="block h-full bg-editorial-ink" style={{ width: `${tokens.input / total * 100}%` }} />
            <span className="block h-full bg-editorial-ink/40" style={{ width: `${tokens.output / total * 100}%` }} />
          </span>
        )}
        <SeriesLegend series={[
          { key: 'input', label: t('dashboardStats.tokens.input'), className: 'bg-editorial-ink' },
          { key: 'output', label: t('dashboardStats.tokens.output'), className: 'bg-editorial-ink/40' },
        ]} />
      </SectionGate>
    </DashboardSection>
  );
}
