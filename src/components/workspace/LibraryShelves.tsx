import { useState, type ReactNode } from 'react';
import {
  Archive,
  Bookmark,
  BookOpenText,
  Clock,
  Download,
  FilePen,
  FolderMinus,
  FolderPlus,
  Library,
  Tags,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, SectionLabel } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import {
  LIBRARY_SHELVES,
  type LibraryFilters,
  type LibraryShelf,
} from '../../utils/libraryCatalogFilters';
import type { LibrarySavedView } from '../../services/librarySavedViewsService';
import type { SourceCollection } from '../../types';

const SHELF_ICONS: Record<LibraryShelf, LucideIcon> = {
  all: Library,
  recent: Clock,
  toDownload: Download,
  transcribing: FilePen,
  unlinked: FolderMinus,
  archived: Archive,
};

/** Una voce della colonna: segno, nome, quante opere. La scelta è in verde. */
function ShelfItem({ icon: Icon, label, count, active, onSelect, action }: {
  icon: LucideIcon;
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
  action?: ReactNode;
}) {
  return (
    <li className="group/shelf flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-editorial-accent ${
          active ? 'bg-editorial-accent/10 text-editorial-accent' : 'text-editorial-ink hover:bg-surface-hover/50'
        }`}
      >
        <Icon size={14} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-editorial-muted">{count}</span>}
      </button>
      {action}
    </li>
  );
}

/** Un nome nuovo scritto in fondo a una sezione: Invio salva, vuoto non salva. */
function NameField({ placeholder, label, icon: Icon, onSave }: {
  placeholder: string;
  label: string;
  icon: LucideIcon;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const save = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
  };
  return (
    <div className="flex items-center gap-1 px-2 pt-1">
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') save(); }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={`${FIELD_CLASSNAME} py-1 text-xs`}
      />
      <IconButton size="xs" disabled={!name.trim()} onClick={save} title={label}>
        <Icon size={12} />
      </IconButton>
    </div>
  );
}

/**
 * La colonna degli scaffali: modi fissi di guardare il catalogo, le raccolte
 * fatte a mano e le viste salvate, cioè filtri che si aggiornano da soli. Una
 * sola cosa è scelta alla volta: uno scaffale oppure una raccolta.
 */
export function LibraryShelves({
  filters,
  onChange,
  shelfCounts,
  collections,
  collectionCounts,
  savedViews,
  canSaveView,
  onCreateCollection,
  onDeleteCollection,
  onSaveView,
  onDeleteView,
}: {
  filters: LibraryFilters;
  onChange: (filters: LibraryFilters) => void;
  shelfCounts: Record<LibraryShelf, number>;
  collections: SourceCollection[];
  collectionCounts: Map<string, number>;
  savedViews: LibrarySavedView[];
  canSaveView: boolean;
  onCreateCollection: (name: string) => void;
  onDeleteCollection: (collectionId: string) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (viewId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('areas.library.shelves.title')} className="flex min-w-0 flex-col gap-5 overflow-y-auto px-2 py-4 custom-scrollbar">
      <ul className="space-y-0.5">
        {LIBRARY_SHELVES.map((shelf) => (
          <ShelfItem
            key={shelf}
            icon={SHELF_ICONS[shelf]}
            label={t(`areas.library.shelves.${shelf}`)}
            count={shelfCounts[shelf]}
            active={!filters.collectionId && filters.shelf === shelf}
            onSelect={() => onChange({ ...filters, shelf, collectionId: '' })}
          />
        ))}
      </ul>

      <section className="space-y-1">
        <div className="px-2"><SectionLabel icon={Tags} label={t('areas.library.shelves.collections')} /></div>
        <ul className="space-y-0.5">
          {collections.map((collection) => (
            <ShelfItem
              key={collection.id}
              icon={BookOpenText}
              label={collection.name}
              count={collectionCounts.get(collection.id) ?? 0}
              active={filters.collectionId === collection.id}
              onSelect={() => onChange({ ...filters, shelf: 'all', collectionId: collection.id })}
              action={
                <IconButton size="xs" tone="danger" className="opacity-0 group-hover/shelf:opacity-100 focus-visible:opacity-100"
                  onClick={() => onDeleteCollection(collection.id)}
                  title={t('areas.library.shelves.deleteCollection', { name: collection.name })}>
                  <Trash2 size={12} />
                </IconButton>
              }
            />
          ))}
        </ul>
        <NameField placeholder={t('areas.library.shelves.newCollection')} label={t('areas.library.shelves.createCollection')}
          icon={FolderPlus} onSave={onCreateCollection} />
      </section>

      <section className="space-y-1">
        <div className="px-2"><SectionLabel icon={Bookmark} label={t('areas.library.shelves.savedViews')} /></div>
        <ul className="space-y-0.5">
          {savedViews.map((view) => (
            <ShelfItem
              key={view.id}
              icon={Bookmark}
              label={view.name}
              active={false}
              onSelect={() => onChange(view.filters)}
              action={
                <IconButton size="xs" tone="danger" className="opacity-0 group-hover/shelf:opacity-100 focus-visible:opacity-100"
                  onClick={() => onDeleteView(view.id)}
                  title={t('areas.library.filters.deleteView', { name: view.name })}>
                  <Trash2 size={12} />
                </IconButton>
              }
            />
          ))}
        </ul>
        {canSaveView && (
          <NameField placeholder={t('areas.library.filters.newViewPlaceholder')} label={t('areas.library.filters.saveView')}
            icon={Bookmark} onSave={onSaveView} />
        )}
      </section>
    </nav>
  );
}
