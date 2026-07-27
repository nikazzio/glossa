import { FilePen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../ui';

/**
 * Area globale Trascrizioni (#210 Passo B): catalogo di tutti i documenti di
 * trascrizione, indipendente dal workspace attivo. Ancora senza contenuto —
 * arriva con lo Studio di trascrizione (#182/#219).
 */
export function TranscriptionsCatalogArea() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="px-5 py-5 md:px-6">
        <h1 className="mb-5 font-display text-4xl italic text-editorial-ink md:text-5xl">
          {t('areas.transcriptions.title')}
        </h1>
        <EmptyState
          icon={<FilePen size={28} />}
          message={t('areas.transcriptions.emptyMessage')}
          hint={t('areas.transcriptions.emptyHint')}
        />
      </div>
    </main>
  );
}
