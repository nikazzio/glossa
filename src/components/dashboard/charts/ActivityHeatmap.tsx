import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { intensityLevels, intensityOf, type ActivityDay } from '../../../utils/dashboardActivity';
import { formatMonth, formatShortDate } from './format';

/** Toni del calendario: inchiostro a quattro intensità, una sola tinta come
 *  vuole una scala di quantità. Il vuoto è il fondo dei campi. */
const INTENSITY_CLASSNAME = [
  'bg-editorial-textbox',
  'bg-editorial-ink/25',
  'bg-editorial-ink/45',
  'bg-editorial-ink/70',
  'bg-editorial-ink',
] as const;

const WEEKDAY_ROWS = [0, 2, 4];

/**
 * Il lavoro giorno per giorno: una colonna per settimana, una casella per
 * giorno. Il dettaglio del giorno sotto il puntatore sta nella riga sotto la
 * griglia, non in un riquadro per casella. Le caselle non prendono il fuoco:
 * centottanta fermate di tabulatore renderebbero la pagina impraticabile; chi
 * legge con la voce ha il dettaglio di ogni giorno nel suo nome.
 */
export function ActivityHeatmap({ weeks }: { weeks: ActivityDay[][] }) {
  const { t, i18n } = useTranslation();
  const days = weeks.flat();
  const levels = intensityLevels(days);
  const [focused, setFocused] = useState<ActivityDay | null>(null);
  const describe = (day: ActivityDay) => day.total === 0
    ? t('dashboardStats.rhythm.none', { date: formatShortDate(new Date(`${day.day}T12:00`), i18n.language) })
    : t('dashboardStats.rhythm.day', {
      date: formatShortDate(new Date(`${day.day}T12:00`), i18n.language),
      transcription: day.counts.transcription,
      ocr: day.counts.ocr,
      translation: day.counts.translation,
      source: day.counts.source,
    });

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <div className="grid shrink-0 grid-rows-[0.75rem_repeat(7,0.75rem)] gap-[3px] pr-1 text-caption leading-3 text-editorial-muted" aria-hidden="true">
          <span />
          {Array.from({ length: 7 }, (_, weekday) => (
            <span key={weekday}>{WEEKDAY_ROWS.includes(weekday) ? t(`dashboardStats.weekdayShort.${weekday}`) : ''}</span>
          ))}
        </div>
        <div className="flex min-w-0 gap-[3px] overflow-x-auto" role="list" aria-label={t('dashboardStats.rhythm.title')}>
          {weeks.map((week, index) => {
            const month = week[0].day.slice(0, 7);
            const showMonth = index === 0 || weeks[index - 1][0].day.slice(0, 7) !== month;
            return (
              <div key={week[0].day} className="grid grid-rows-[0.75rem_repeat(7,0.75rem)] gap-[3px]" role="listitem">
                <span className="w-3 overflow-visible whitespace-nowrap text-caption leading-3 text-editorial-muted" aria-hidden="true">
                  {showMonth ? formatMonth(month, i18n.language) : ''}
                </span>
                {week.map((day) => (
                  <span
                    key={day.day}
                    role="img"
                    aria-label={day.future ? undefined : describe(day)}
                    aria-hidden={day.future || undefined}
                    onMouseEnter={() => setFocused(day.future ? null : day)}
                    onMouseLeave={() => setFocused(null)}
                    className={`h-3 w-3 rounded-[3px] ${
                      day.future ? 'bg-transparent' : INTENSITY_CLASSNAME[intensityOf(day.total, levels)]
                    }`}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-editorial-muted">
        <span className="min-w-0 truncate" aria-live="polite">{focused ? describe(focused) : t('dashboardStats.rhythm.hover')}</span>
        <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
          {t('dashboardStats.rhythm.less')}
          {INTENSITY_CLASSNAME.map((className) => <span key={className} className={`h-2.5 w-2.5 rounded-[3px] ${className}`} />)}
          {t('dashboardStats.rhythm.more')}
        </span>
      </div>
    </div>
  );
}
