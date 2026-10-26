import { Archive, BookX, CircleDashed, Clock, FilePen, Library, Lock, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShelfItem } from '../ui';
import {
  TRANSCRIPTION_SHELVES,
  type TranscriptionFilters,
  type TranscriptionShelf,
} from '../../utils/transcriptionCatalogFilters';

const SHELF_ICONS: Record<TranscriptionShelf, LucideIcon> = {
  all: Library,
  recent: Clock,
  toStart: CircleDashed,
  inProgress: FilePen,
  verified: Lock,
  unlinked: BookX,
  archived: Archive,
};

/** La colonna degli scaffali delle Trascrizioni: modi fissi di guardare il catalogo. */
export function TranscriptionShelves({ filters, onChange, counts }: {
  filters: TranscriptionFilters;
  onChange: (filters: TranscriptionFilters) => void;
  counts: Record<TranscriptionShelf, number>;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('areas.transcriptions.catalog.shelves.title')} className="flex min-w-0 flex-col gap-5 overflow-y-auto px-2 py-4 custom-scrollbar">
      <ul className="space-y-0.5">
        {TRANSCRIPTION_SHELVES.map((shelf) => (
          <ShelfItem
            key={shelf}
            icon={SHELF_ICONS[shelf]}
            label={t(`areas.transcriptions.catalog.shelves.${shelf}`)}
            count={counts[shelf]}
            active={filters.shelf === shelf}
            onSelect={() => onChange({ ...filters, shelf })}
          />
        ))}
      </ul>
    </nav>
  );
}
