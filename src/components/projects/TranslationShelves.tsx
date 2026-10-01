import { CircleCheck, CircleDashed, Clock, Languages, Library, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShelfItem } from '../ui';
import {
  TRANSLATION_SHELVES,
  type TranslationFilters,
  type TranslationShelf,
} from '../../utils/translationCatalogFilters';

const SHELF_ICONS: Record<TranslationShelf, LucideIcon> = {
  all: Library,
  recent: Clock,
  toStart: CircleDashed,
  inProgress: Languages,
  verified: CircleCheck,
};

/** La colonna degli scaffali delle Traduzioni: modi fissi di guardare il catalogo. */
export function TranslationShelves({ filters, onChange, counts }: {
  filters: TranslationFilters;
  onChange: (filters: TranslationFilters) => void;
  counts: Record<TranslationShelf, number>;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('areas.translations.catalog.shelves.title')} className="flex min-w-0 flex-col gap-5 overflow-y-auto px-2 py-4 custom-scrollbar">
      <ul className="space-y-0.5">
        {TRANSLATION_SHELVES.map((shelf) => (
          <ShelfItem
            key={shelf}
            icon={SHELF_ICONS[shelf]}
            label={t(`areas.translations.catalog.shelves.${shelf}`)}
            count={counts[shelf]}
            active={filters.shelf === shelf}
            onSelect={() => onChange({ ...filters, shelf })}
          />
        ))}
      </ul>
    </nav>
  );
}
