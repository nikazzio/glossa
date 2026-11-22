import { useTranslation } from 'react-i18next';
import { AreaPage } from '../dashboard/AreaPage';
import { StatsDashboard } from '../dashboard/StatsDashboard';

/** Area globale Analisi (epic #377), indipendente dal workspace attivo; per ora ha la sola vista Statistiche. */
export function AnalysisArea() {
  const { t } = useTranslation();
  return <AreaPage title={t('areas.analysis.title')} view={t('dashboardStats.title')}>
    <StatsDashboard />
  </AreaPage>;
}
