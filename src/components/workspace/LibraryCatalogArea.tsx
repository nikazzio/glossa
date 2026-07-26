import { LibraryBig } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../ui';

/**
 * Area globale Biblioteca (#210 Passo B): catalogo di tutte le fonti/libri,
 * indipendente dal workspace attivo. Ancora senza contenuto — arriva con
 * #214-217 (registry IIIF, discovery, add-to-library).
 */
export function LibraryCatalogArea() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 h-full min-h-0 flex-col overflow-y-auto bg-editorial-paper custom-scrollbar">
      <div className="px-5 py-5 md:px-6">
        <h1 className="mb-5 font-display text-4xl italic text-editorial-ink md:text-5xl">
          {t('areas.library.title')}
        </h1>
        <EmptyState
          icon={<LibraryBig size={28} />}
          message={t('areas.library.emptyMessage')}
          hint={t('areas.library.emptyHint')}
        />
      </div>
    </main>
  );
}
