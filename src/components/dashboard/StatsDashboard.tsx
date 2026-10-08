import { useMemo, useState } from 'react';
import { CalendarRange, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDashboardStats } from '../../hooks/useDashboardStats';
import { usePricingStore } from '../../stores/pricingStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { activityWeeks } from '../../utils/dashboardActivity';
import { summarizeGlossaries } from '../../utils/glossaryStats';
import {
  chunkCosts,
  costPerThousandWords,
  inPeriod,
  monthProjection,
  summarizeModels,
  summarizeOcrPrecision,
  summarizeQuality,
  summarizeSpend,
  summarizeTokens,
  type StatsPeriod,
} from '../../utils/dashboardStats';
import { formatUsd } from '../../utils/operationLogStats';
import { ChoiceDots, IconButton, Select } from '../ui';
import { DashboardBoard, type BoardSection } from './DashboardBoard';
import { formatCompact, formatCount } from './charts/format';
import { SpendSection, TokensSection } from './stats/StatsCostSections';
import { ModelsSection, OcrSection, PerformanceSection, QualitySection } from './stats/StatsModelSections';
import { ForecastSection, MemorySection, RhythmSection } from './stats/StatsWorkSections';
import { GlossarySection } from './stats/StatsGlossarySection';
import { Figure } from './stats/statsCommon';

/**
 * Le Statistiche: come si sta lavorando, quanto costa, quali modelli rendono.
 * Tutto calcolato da quello che l'applicazione registra già; un filtro per
 * workspace e uno per periodo valgono per tutte le sezioni che hanno una data.
 */
export function StatsDashboard() {
  const { t, i18n } = useTranslation();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const pricing = usePricingStore((state) => state.overrides);
  const period = useUiStore((state) => state.statsPeriod);
  const setPeriod = useUiStore((state) => state.setStatsPeriod);
  const columns = useUiStore((state) => state.statsSectionColumns);
  const setColumns = useUiStore((state) => state.setStatsSectionColumns);
  const [scope, setScope] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const data = useDashboardStats(scope, period, revision, pricing);

  const allUsage = useMemo(() => data.usage.data ?? [], [data.usage.data]);
  const usage = useMemo(() => allUsage.filter((row) => inPeriod(row.at, data.since)), [allUsage, data.since]);
  const spend = useMemo(() => summarizeSpend(usage, pricing), [usage, pricing]);
  const costs = useMemo(() => chunkCosts(allUsage, pricing), [allUsage, pricing]);
  const month = useMemo(() => monthProjection(allUsage, pricing), [allUsage, pricing]);
  const models = useMemo(() => summarizeModels(usage, pricing), [usage, pricing]);
  const tokens = useMemo(() => summarizeTokens(usage), [usage]);
  const quality = useMemo(() => summarizeQuality(data.quality.data ?? [], costs), [data.quality.data, costs]);
  const precision = useMemo(() => summarizeOcrPrecision(data.ocr.data ?? []), [data.ocr.data]);
  const glossaries = useMemo(() => (data.glossaries.data ? summarizeGlossaries(data.glossaries.data) : null), [data.glossaries.data]);
  const weeks = useMemo(() => activityWeeks(data.activity.data ?? []), [data.activity.data]);
  const perThousand = useMemo(() => costPerThousandWords(costs, data.chunkWords.data ?? []), [costs, data.chunkWords.data]);

  const sections: BoardSection[] = [
    { id: 'forecast', node: <ForecastSection progress={data.progress} /> },
    { id: 'rhythm', node: <RhythmSection activity={data.activity} weeks={weeks} /> },
    { id: 'quality', node: <QualitySection state={mergeStates(data.quality, data.usage)} quality={quality} /> },
    { id: 'spend', node: <SpendSection state={mergeStates(data.usage, data.chunkWords)} spend={spend} month={month} perThousand={perThousand} /> },
    { id: 'tokens', node: <TokensSection state={data.usage} tokens={tokens} /> },
    { id: 'models', node: <ModelsSection state={data.usage} models={models} /> },
    { id: 'ocr', node: <OcrSection state={data.ocr} precision={precision} /> },
    { id: 'performance', node: <PerformanceSection state={data.usage} models={models} /> },
    { id: 'memory', node: <MemorySection memory={data.memory} languages={data.languages} /> },
    { id: 'glossaries', node: <GlossarySection state={data.glossaries} stats={glossaries} /> },
  ];

  return (
    <main className="h-full min-h-0 w-full overflow-y-auto bg-editorial-bg px-5 py-5 custom-scrollbar md:px-6">
      <header className="flex flex-wrap items-center justify-end gap-3">
        <ChoiceDots<StatsPeriod>
          value={period}
          onChange={setPeriod}
          ariaLabel={t('dashboardStats.period.label')}
          categoryIcon={CalendarRange}
          options={[
            { value: '30d', label: t('dashboardStats.period.30d'), content: '30' },
            { value: '6m', label: t('dashboardStats.period.6m'), content: '6' },
            { value: 'all', label: t('dashboardStats.period.all'), content: '∞' },
          ]}
        />
        <Select value={scope ?? ''} onChange={(value) => setScope(value || null)} ariaLabel={t('overview.scope')}
          options={[{ value: '', label: t('overview.global') }, ...workspaces.map((w) => ({ value: w.id, label: w.name }))]} />
        <IconButton title={t('dashboard.refresh')} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={16} /></IconButton>
      </header>

      <section className="my-4 grid grid-cols-2 gap-4 border-y border-editorial-border py-3 xl:grid-cols-4" aria-label={t('dashboardStats.headline')}>
        <Figure value={data.words.data ? formatCompact(data.words.data.transcribed_words, i18n.language) : '—'}
          label={t('dashboardStats.wordsTranscribed')} />
        <Figure value={data.words.data ? formatCompact(data.words.data.translated_words, i18n.language) : '—'}
          label={t('dashboardStats.wordsTranslated')} />
        <Figure value={data.usage.data ? formatUsd(spend.total) : '—'} label={t(`dashboardStats.spentIn.${period}`)} />
        <Figure value={data.memory.data ? formatCount(data.memory.data.total, i18n.language) : '—'}
          label={t('dashboardStats.memory.phrases')} />
      </section>

      <DashboardBoard sections={sections} columns={columns} onColumnsChange={setColumns} />
    </main>
  );
}

function mergeStates(...states: { loading: boolean; error: boolean }[]) {
  return { loading: states.some((state) => state.loading), error: states.some((state) => state.error) };
}
