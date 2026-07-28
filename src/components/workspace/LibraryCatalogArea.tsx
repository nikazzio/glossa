import { LibraryBig } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../ui';

/** Catalogo personale delle fonti: la ricerca vive nella Dashboard. */
export function LibraryCatalogArea() {
  const { t } = useTranslation();

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-surface-panel custom-scrollbar">
      <div className="px-5 py-5 md:px-6">
        <h1 className="font-display text-4xl italic text-editorial-ink md:text-5xl">
          {t('areas.library.title')}
        </h1>
        <EmptyState
          icon={<LibraryBig size={28} />}
          message={t('areas.library.emptyMessage')}
          hint={t('areas.library.emptyHint')}
          className="min-h-72"
        />
      </div>
    </main>
  );
}
