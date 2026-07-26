import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../ui';

/**
 * Area globale Analisi (#210 Passo B, epic #377): metriche, confronti e
 * dataset, indipendente dal workspace attivo. Ancora senza contenuto —
 * arriva con #378-381.
 */
export function AnalysisArea() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="px-5 py-5 md:px-6">
        <h1 className="mb-5 font-display text-4xl italic text-editorial-ink md:text-5xl">
          {t('areas.analysis.title')}
        </h1>
        <EmptyState
          icon={<BarChart3 size={28} />}
          message={t('areas.analysis.emptyMessage')}
          hint={t('areas.analysis.emptyHint')}
        />
      </div>
    </main>
  );
}
