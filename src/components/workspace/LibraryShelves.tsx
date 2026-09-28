import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  Archive,
  Bookmark,
  BookOpenText,
  Clock,
  Download,
  FilePen,
  FolderMinus,
  Library,
  Plus,
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
import { DRAGGED_SOURCES } from './LibraryCatalogRow';

const SHELF_ICONS: Record<LibraryShelf, LucideIcon> = {
  all: Library,
  recent: Clock,
  toDownload: Download,
  transcribing: FilePen,
  unlinked: FolderMinus,
  archived: Archive,
};

/** Gli identificativi trascinati da una riga del catalogo, se lo sono davvero. */
function draggedSources(event: DragEvent): string[] {
  try {
    const parsed: unknown = JSON.parse(event.dataTransfer.getData(DRAGGED_SOURCES));
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Una voce della colonna: segno, nome, quante opere. La scelta è in verde.
 *  Con `onDropSources` la voce accetta le opere trascinate dal catalogo. */
function ShelfItem({ icon: Icon, label, count, active, onSelect, action, onDropSources }: {
  icon: LucideIcon;
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
  action?: ReactNode;
  onDropSources?: (sourceIds: string[]) => void;
}) {
  const [over, setOver] = useState(false);
  const accepts = (event: DragEvent) => onDropSources !== undefined && event.dataTransfer.types.includes(DRAGGED_SOURCES);
  return (
    <li
      className={`group/shelf flex items-center gap-1 rounded ${over ? 'ring-2 ring-editorial-accent' : ''}`}
      onDragOver={(event) => { if (!accepts(event)) return; event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false);
        if (!accepts(event)) return;
        event.preventDefault();
        const ids = draggedSources(event);
        if (ids.length > 0) onDropSources?.(ids);
      }}
    >
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

/**
 * Il nome di una voce nuova, scritto dove la voce comparirà. Si apre solo dal
 * «+» della sezione: Invio salva, Esc o un click fuori annullano.
 */
function NameField({ label, onSave, onCancel }: {
  label: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  // Il campo si apre perché lo si è chiesto col «+»: il fuoco ci va subito.
  useEffect(() => { input.current?.focus(); }, []);
  const save = () => {
    if (!name.trim()) return;
    onSave(name.trim());
  };
  return (
    <div className="px-2 pt-1">
      <input
        ref={input}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save();
          if (event.key === 'Escape') onCancel();
        }}
        onBlur={onCancel}
        placeholder={label}
        aria-label={label}
        className={`${FIELD_CLASSNAME} py-1 text-xs`}
      />
    </div>
  );
}

/** Titoletto di sezione con il suo «+» per aggiungere una voce. */
function SectionHeader({ icon, label, addLabel, canAdd, onAdd }: {
  icon: LucideIcon;
  label: string;
  addLabel: string;
  canAdd: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2">
      <SectionLabel icon={icon} label={label} />
      <IconButton size="xs" disabled={!canAdd} onClick={onAdd} title={addLabel}>
        <Plus size={12} />
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
  onDropOnCollection,
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
  onDropOnCollection: (collectionId: string, sourceIds: string[]) => void;
  onSaveView: (name: string) => void;
  onDeleteView: (viewId: string) => void;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState<'collection' | 'view' | null>(null);
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
        <SectionHeader icon={Tags} label={t('areas.library.shelves.collections')}
          addLabel={t('areas.library.shelves.createCollection')} canAdd onAdd={() => setAdding('collection')} />
        <ul className="space-y-0.5">
          {collections.map((collection) => (
            <ShelfItem
              key={collection.id}
              icon={BookOpenText}
              label={collection.name}
              count={collectionCounts.get(collection.id) ?? 0}
              active={filters.collectionId === collection.id}
              onSelect={() => onChange({ ...filters, shelf: 'all', collectionId: collection.id })}
              onDropSources={(sourceIds) => onDropOnCollection(collection.id, sourceIds)}
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
        {adding === 'collection' ? (
          <NameField label={t('areas.library.shelves.newCollection')} onCancel={() => setAdding(null)}
            onSave={(name) => { onCreateCollection(name); setAdding(null); }} />
        ) : collections.length === 0 && (
          <p className="px-2 text-xs text-editorial-muted">{t('areas.library.shelves.noCollections')}</p>
        )}
      </section>

      <section className="space-y-1">
        {/* Una vista ricorda i filtri scelti sopra l'elenco: senza filtri non
            c'è niente da ricordare, e il «+» lo dice invece di sparire. */}
        <SectionHeader icon={Bookmark} label={t('areas.library.shelves.savedViews')}
          addLabel={canSaveView ? t('areas.library.filters.saveView') : t('areas.library.filters.saveViewNeedsFilters')}
          canAdd={canSaveView} onAdd={() => setAdding('view')} />
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
        {adding === 'view' && canSaveView ? (
          <NameField label={t('areas.library.filters.newViewPlaceholder')} onCancel={() => setAdding(null)}
            onSave={(name) => { onSaveView(name); setAdding(null); }} />
        ) : savedViews.length === 0 && (
          <p className="px-2 text-xs text-editorial-muted">{t('areas.library.shelves.noSavedViews')}</p>
        )}
      </section>
    </nav>
  );
}
