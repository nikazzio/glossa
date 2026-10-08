import { useState } from 'react';
import { Bot, Gauge, ScanText, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MIN_SAMPLE, type ModelQuality, type ModelSummary, type OcrPrecision } from '../../../utils/dashboardStats';
import { formatUsd } from '../../../utils/operationLogStats';
import { ChoiceDots } from '../../ui';
import { DashboardSection } from '../DashboardSection';
import { MeterRow } from '../charts/MeterRow';
import { RatingBar, RatingLegend } from '../charts/RatingBar';
import { formatCompact, formatCount, formatPercent, formatSeconds } from '../charts/format';
import { modelName, SectionGate, type ResourceState } from './statsCommon';

type ModelMetric = 'calls' | 'tokens' | 'cost';

/** Quanti modelli si mostrano per classifica. */
const TOP_MODELS = 6;

/** Classifica dei modelli per chiamate, token o spesa. */
export function ModelsSection({ state, models }: { state: ResourceState; models: ModelSummary[] }) {
  const { t, i18n } = useTranslation();
  const [metric, setMetric] = useState<ModelMetric>('calls');
  const valueOf = (model: ModelSummary) =>
    metric === 'calls' ? model.calls : metric === 'tokens' ? model.inputTokens + model.outputTokens : model.cost ?? 0;
  const sorted = [...models].sort((a, b) => valueOf(b) - valueOf(a)).slice(0, TOP_MODELS);
  const maximum = Math.max(1e-9, ...sorted.map(valueOf));
  const show = (model: ModelSummary) => {
    if (metric === 'calls') return formatCount(model.calls, i18n.language);
    if (metric === 'tokens') return formatCompact(model.inputTokens + model.outputTokens, i18n.language);
    return model.free ? t('cost.free') : formatUsd(model.cost);
  };
  const note = (model: ModelSummary) => [
    model.provider,
    model.ocrCalls > 0 ? t('dashboardStats.models.ocrShare', { count: model.ocrCalls }) : null,
  ].filter(Boolean).join(' · ');
  return (
    <DashboardSection id="stats-models" icon={Bot} label={t('dashboardStats.models.title')} hint={t('dashboardStats.models.hint')}>
      <SectionGate states={[state]} insufficient={models.length === 0}>
        <ChoiceDots<ModelMetric>
          value={metric}
          onChange={setMetric}
          ariaLabel={t('dashboardStats.models.metric')}
          options={[
            { value: 'calls', label: t('dashboardStats.models.calls'), content: '#' },
            { value: 'tokens', label: t('dashboardStats.models.tokens'), content: 'T' },
            { value: 'cost', label: t('dashboardStats.models.cost'), content: '$' },
          ]}
        />
        {sorted.map((model) => (
          <MeterRow key={model.key} label={modelName(model.model)} note={note(model)}
            ratio={valueOf(model) / maximum} value={show(model)} />
        ))}
      </SectionGate>
    </DashboardSection>
  );
}

/** Giudizi per modello e quanto costa un frammento giudicato buono. */
export function QualitySection({ state, quality }: { state: ResourceState; quality: ModelQuality[] }) {
  const { t, i18n } = useTranslation();
  return (
    <DashboardSection id="stats-quality" icon={Sparkles} label={t('dashboardStats.quality.title')} hint={t('dashboardStats.quality.hint')}>
      <SectionGate states={[state]} insufficient={quality.length === 0}>
        {quality.slice(0, TOP_MODELS).map((entry) => (
          <div key={entry.key} className="space-y-1 py-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="truncate text-sm text-editorial-ink">{modelName(entry.model)}</p>
              <p className="shrink-0 text-xs text-editorial-muted">{t('dashboardStats.quality.judged', { count: entry.judged })}</p>
            </div>
            <RatingBar counts={entry.counts} total={entry.judged} />
            <p className="text-xs text-editorial-muted">
              {t('dashboardStats.quality.goodShare', {
                share: formatPercent(entry.goodShare, i18n.language),
                low: formatPercent(entry.goodInterval?.low ?? 0, i18n.language),
                high: formatPercent(entry.goodInterval?.high ?? 0, i18n.language),
              })}
              {' · '}
              {entry.costPerGood !== null
                ? t('dashboardStats.quality.perGood', { cost: formatUsd(entry.costPerGood), count: entry.costSample })
                : t('dashboardStats.quality.perGoodMissing', { min: MIN_SAMPLE, count: entry.costSample })}
            </p>
          </div>
        ))}
        <RatingLegend />
      </SectionGate>
    </DashboardSection>
  );
}

/** Quanto testo letto dall'OCR è stato poi corretto a mano, per modello. */
export function OcrSection({ state, precision }: { state: ResourceState; precision: OcrPrecision[] }) {
  const { t, i18n } = useTranslation();
  const worst = Math.max(0.01, ...precision.map((entry) => entry.cer));
  return (
    <DashboardSection id="stats-ocr" icon={ScanText} label={t('dashboardStats.ocr.title')} hint={t('dashboardStats.ocr.hint')}>
      <SectionGate states={[state]} insufficient={precision.length === 0}>
        {precision.map((entry) => (
          <MeterRow key={entry.model} label={modelName(entry.model)}
            note={entry.interval
              ? t('dashboardStats.ocr.pagesRange', {
                count: entry.pages,
                low: formatPercent(entry.interval.low, i18n.language, 1),
                high: formatPercent(entry.interval.high, i18n.language, 1),
              })
              : t('dashboardStats.ocr.pages', { count: entry.pages })}
            ratio={entry.cer / worst}
            value={t('dashboardStats.ocr.corrected', { rate: formatPercent(entry.cer, i18n.language, 1) })} />
        ))}
      </SectionGate>
    </DashboardSection>
  );
}

/** Tempi di risposta e affidabilità per modello. */
export function PerformanceSection({ state, models }: { state: ResourceState; models: ModelSummary[] }) {
  const { t, i18n } = useTranslation();
  const timed = models.filter((model) => model.medianSeconds !== null).slice(0, TOP_MODELS);
  const slowest = Math.max(1, ...timed.map((model) => model.medianSeconds ?? 0));
  return (
    <DashboardSection id="stats-performance" icon={Gauge} label={t('dashboardStats.performance.title')} hint={t('dashboardStats.performance.hint')}>
      <SectionGate states={[state]} insufficient={timed.length === 0}>
        {timed.map((model) => (
          <MeterRow key={model.key} label={modelName(model.model)}
            note={[
              t('dashboardStats.performance.p90', { seconds: formatSeconds(model.p90Seconds ?? 0, i18n.language) }),
              model.failures === 0
                ? t('dashboardStats.performance.noFailures', { count: model.attempts })
                : t('dashboardStats.performance.failures', {
                  rate: formatPercent(model.failureRate ?? 0, i18n.language, 1),
                  low: formatPercent(model.failureInterval?.low ?? 0, i18n.language, 1),
                  high: formatPercent(model.failureInterval?.high ?? 0, i18n.language, 1),
                  count: model.attempts,
                }),
            ].join(' · ')}
            ratio={(model.medianSeconds ?? 0) / slowest}
            value={formatSeconds(model.medianSeconds ?? 0, i18n.language)} />
        ))}
      </SectionGate>
    </DashboardSection>
  );
}
