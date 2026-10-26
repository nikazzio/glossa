import { BookOpenCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GlossaryReport, GlossaryStats } from '../../../utils/glossaryStats';
import { TOP_TERMS } from '../../../utils/glossaryStats';
import { Hint } from '../../ui';
import { DashboardSection } from '../DashboardSection';
import { Sparkline } from '../charts/Sparkline';
import { formatPercent } from '../charts/format';
import { SectionGate, type ResourceState } from './statsCommon';

/** Voci mai incontrate elencate nel suggerimento, oltre si scrive quante altre. */
const NEVER_SEEN_PREVIEW = 20;

function GlossaryRow({ report }: { report: GlossaryReport }) {
  const { t, i18n } = useTranslation();
  const cumulative = report.monthlyEntries.reduce<number[]>((acc, count) => [...acc, (acc.at(-1) ?? 0) + count], []);
  const languages = [report.sourceLanguage, report.targetLanguage].filter(Boolean).join(' → ');
  const neverSeenList = report.neverSeen.slice(0, NEVER_SEEN_PREVIEW).join(', ')
    + (report.neverSeen.length > NEVER_SEEN_PREVIEW ? ` … +${report.neverSeen.length - NEVER_SEEN_PREVIEW}` : '');
  return (
    <div className="space-y-1 border-b border-rule py-2.5 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display italic text-editorial-ink">{report.name}</p>
          <p className="text-xs text-editorial-muted">
            {[t('dashboardStats.glossaries.entries', { count: report.entries }), languages,
              t('dashboardStats.glossaries.projects', { count: report.projects })].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Sparkline values={cumulative} ariaLabel={t('dashboardStats.glossaries.growth', { name: report.name })} />
      </div>
      {!report.hasTexts ? (
        <p className="text-xs text-editorial-muted">{t('dashboardStats.glossaries.unused')}</p>
      ) : (
        <>
          <p className="text-sm text-editorial-ink">
            {report.rate === null
              ? t('dashboardStats.glossaries.noCases')
              : t('dashboardStats.glossaries.respected', {
                rate: formatPercent(report.rate, i18n.language),
                low: formatPercent(report.interval?.low ?? 0, i18n.language),
                high: formatPercent(report.interval?.high ?? 0, i18n.language),
                count: report.cases,
              })}
          </p>
          {report.mostMissed.length > 0 && (
            <p className="text-xs text-editorial-muted">
              {t('dashboardStats.glossaries.mostMissed', {
                terms: report.mostMissed.map((entry) => `${entry.term} (${entry.misses})`).join(', '),
              })}
            </p>
          )}
          {report.neverSeen.length > 0 && (
            <p className="text-xs text-editorial-muted">
              <Hint label={neverSeenList} side="top">
                {t('dashboardStats.glossaries.neverSeen', { count: report.neverSeen.length })}
              </Hint>
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Glossari: panorama, rispetto nelle traduzioni, voci mai incontrate, conflitti. */
export function GlossarySection({ state, stats }: { state: ResourceState; stats: GlossaryStats | null }) {
  const { t } = useTranslation();
  const conflicts = stats?.conflicts ?? [];
  return (
    <DashboardSection id="stats-glossaries" icon={BookOpenCheck} label={t('dashboardStats.glossaries.title')} hint={t('dashboardStats.glossaries.hint')}>
      <SectionGate states={[state]} insufficient={(stats?.reports.length ?? 0) === 0}>
        {stats?.reports.map((report) => <GlossaryRow key={report.id} report={report} />)}
        <p className="caption-label pt-2">{t('dashboardStats.glossaries.conflictsTitle', { count: conflicts.length })}</p>
        {conflicts.length === 0
          ? <p className="text-xs text-editorial-muted">{t('dashboardStats.glossaries.noConflicts')}</p>
          : conflicts.slice(0, TOP_TERMS).map((conflict) => (
            <p key={conflict.term} className="text-sm text-editorial-ink">
              <span className="font-semibold">{conflict.term}</span>
              <span className="text-editorial-muted">
                {' — '}{conflict.translations.map((entry) => `${entry.translation} (${entry.glossaries.join(', ')})`).join(' · ')}
              </span>
            </p>
          ))}
        {conflicts.length > TOP_TERMS && (
          <p className="text-xs text-editorial-muted">{t('dashboardStats.glossaries.moreConflicts', { count: conflicts.length - TOP_TERMS })}</p>
        )}
      </SectionGate>
    </DashboardSection>
  );
}
