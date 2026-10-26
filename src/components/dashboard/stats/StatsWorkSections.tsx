import { ArrowRight, CalendarDays, Languages, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LanguagePairRow, MemoryStats } from '../../../services/statsService';
import type { WorkProgress } from '../../../services/workProgressService';
import { busiestWeekday, currentStreak, type ActivityDay } from '../../../utils/dashboardActivity';
import { monthOf } from '../../../utils/dashboardStats';
import { MIN_WORKED_DAYS } from '../../../utils/statistics';
import { formatUsd } from '../../../utils/operationLogStats';
import { useUiStore } from '../../../stores/uiStore';
import { transcriptionsLocation, translationsLocation } from '../../../navigation/appLocation';
import { LanguagePairLabel } from '../../languages/LanguagePairLabel';
import { CompletionBar, IconButton } from '../../ui';
import { DashboardSection } from '../DashboardSection';
import { ActivityHeatmap } from '../charts/ActivityHeatmap';
import { MeterRow } from '../charts/MeterRow';
import { Sparkline } from '../charts/Sparkline';
import { formatCount, formatDecimal } from '../charts/format';
import { SectionGate, type ResourceState } from './statsCommon';

type Resource<T> = ResourceState & { data: T | null };

/** Una riga per lavoro a metà: avanzamento, previsione, costo per finire. */
function WorkProgressRow({ item }: { item: WorkProgress }) {
  const { t, i18n } = useTranslation();
  const navigate = useUiStore((state) => state.navigate);
  const remaining = item.total - item.done;
  const unit = (count: number) => t(`dashboardStats.forecast.unit.${item.kind}`, { count });
  const open = () => navigate(item.kind === 'transcription'
    ? transcriptionsLocation({ documentId: item.id })
    : translationsLocation({ projectId: item.id }));
  const days = (value: number) => formatCount(Math.ceil(value), i18n.language);
  return (
    <div className="space-y-1 border-b border-rule py-2.5 last:border-0">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-display italic text-editorial-ink">{item.title}</p>
        <IconButton size="sm" title={t('dashboardStats.forecast.open')} onClick={open}><ArrowRight size={16} /></IconButton>
      </div>
      <p className="flex items-center gap-2 text-xs text-editorial-muted">
        <span>{t(`dashboardStats.forecast.kind.${item.kind}`)}</span>
        <CompletionBar ratio={item.done / item.total} label={`${item.done}/${item.total}`}
          ariaLabel={t('dashboardStats.forecast.progress')} />
        <span>{t('dashboardStats.forecast.remaining', { count: remaining, unit: unit(remaining) })}</span>
      </p>
      {item.forecast ? (
        <p className="text-sm text-editorial-ink">
          {Math.ceil(item.forecast.low) === Math.ceil(item.forecast.high)
            ? t('dashboardStats.forecast.daysExact', { median: days(item.forecast.median) })
            : t('dashboardStats.forecast.days', {
              median: days(item.forecast.median),
              low: days(item.forecast.low),
              high: days(item.forecast.high),
            })}
          <span className="text-editorial-muted">
            {' · '}{t('dashboardStats.forecast.pace', {
              value: formatDecimal(item.forecast.meanPerDay, i18n.language),
              unit: unit(item.forecast.meanPerDay),
              days: item.forecast.sampleDays,
            })}
          </span>
        </p>
      ) : (
        <p className="text-xs text-editorial-muted">
          {t('dashboardStats.forecast.notEnough', { min: MIN_WORKED_DAYS, count: item.workedDays })}
        </p>
      )}
      {item.costToFinish && (item.costToFinish.free || item.costToFinish.usd !== null) && (
        <p className="text-xs text-editorial-muted">
          {item.costToFinish.free
            ? t('dashboardStats.forecast.toFinishFree')
            : t('dashboardStats.forecast.toFinish', { cost: formatUsd(item.costToFinish.usd) })}
        </p>
      )}
    </div>
  );
}

/**
 * Lavori a metà, uno per riga. Lo usano la Panoramica e le Statistiche.
 */
export function WorkProgressList({ items }: { items: WorkProgress[] }) {
  return <>{items.map((item) => <WorkProgressRow key={`${item.kind}-${item.id}`} item={item} />)}</>;
}

/** Le previsioni nelle Statistiche. */
export function ForecastSection({ progress }: { progress: Resource<WorkProgress[]> }) {
  const { t } = useTranslation();
  return (
    <DashboardSection id="stats-forecast" icon={Timer} label={t('dashboardStats.forecast.title')} hint={t('dashboardStats.forecast.hint')}>
      <SectionGate states={[progress]} insufficient={(progress.data?.length ?? 0) === 0}>
        <WorkProgressList items={progress.data ?? []} />
      </SectionGate>
    </DashboardSection>
  );
}

/** Calendario del lavoro con giorni di fila e giorno più produttivo. */
export function RhythmSection({ activity, weeks }: { activity: ResourceState; weeks: ActivityDay[][] }) {
  const { t } = useTranslation();
  const days = weeks.flat();
  const streak = currentStreak(days);
  const weekday = busiestWeekday(weeks);
  return (
    <DashboardSection id="stats-rhythm" icon={CalendarDays} label={t('dashboardStats.rhythm.title')} hint={t('dashboardStats.rhythm.hint')}>
      <SectionGate states={[activity]}>
        <p className="text-xs text-editorial-muted">
          {t('dashboardStats.rhythm.streak', { count: streak })}
          {weekday !== null && ` · ${t('dashboardStats.rhythm.busiest', { day: t(`dashboardStats.weekday.${weekday}`) })}`}
        </p>
        <ActivityHeatmap weeks={weeks} />
      </SectionGate>
    </DashboardSection>
  );
}

/** Memoria delle frasi e lingue delle traduzioni. */
export function MemorySection({ memory, languages }: {
  memory: Resource<MemoryStats>;
  languages: Resource<LanguagePairRow[]>;
}) {
  const { t, i18n } = useTranslation();
  const months = memory.data?.months ?? [];
  const thisMonth = months.at(-1)?.month === monthOf(new Date().toISOString()) ? months.at(-1)?.count ?? 0 : 0;
  const cumulative = months.reduce<number[]>((acc, row) => [...acc, (acc.at(-1) ?? 0) + row.count], []);
  const maxPairs = Math.max(1, ...(memory.data?.pairs ?? []).map((pair) => pair.count));
  const maxProjects = Math.max(1, ...(languages.data ?? []).map((pair) => pair.projects));
  return (
    <DashboardSection id="stats-memory" icon={Languages} label={t('dashboardStats.memory.title')} hint={t('dashboardStats.memory.hint')}>
      <SectionGate states={[memory, languages]}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-2xl italic text-editorial-ink tabular-nums">{formatCount(memory.data?.total ?? 0, i18n.language)}</p>
            <p className="caption-label">{t('dashboardStats.memory.phrases')}</p>
            <p className="text-xs text-editorial-muted">{t('dashboardStats.memory.thisMonth', { count: thisMonth })}</p>
          </div>
          <Sparkline values={cumulative} ariaLabel={t('dashboardStats.memory.growth')} />
        </div>
        {(memory.data?.pairs.length ?? 0) > 0 && <p className="caption-label pt-2">{t('dashboardStats.memory.pairs')}</p>}
        {memory.data?.pairs.slice(0, 4).map((pair) => (
          <MeterRow key={`${pair.source_language}-${pair.source_variety}-${pair.target_language}-${pair.target_variety}`}
            label={<LanguagePairLabel source={{ code: pair.source_language, variety: pair.source_variety }}
              target={{ code: pair.target_language, variety: pair.target_variety }} className="text-sm" />}
            ratio={pair.count / maxPairs} value={formatCount(pair.count, i18n.language)} />
        ))}
        {(languages.data?.length ?? 0) > 0 && <p className="caption-label pt-2">{t('dashboardStats.memory.translations')}</p>}
        {languages.data?.slice(0, 4).map((pair) => (
          <MeterRow key={`${pair.source_language}-${pair.source_variety}-${pair.target_language}-${pair.target_variety}`}
            label={<LanguagePairLabel source={{ code: pair.source_language, variety: pair.source_variety }}
              target={{ code: pair.target_language, variety: pair.target_variety }} className="text-sm" />}
            ratio={pair.projects / maxProjects} value={formatCount(pair.projects, i18n.language)} />
        ))}
      </SectionGate>
    </DashboardSection>
  );
}
