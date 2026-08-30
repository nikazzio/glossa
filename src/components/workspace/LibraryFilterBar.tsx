import { useState } from 'react';
import { Archive, Bookmark, Eraser, Search, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ClickPopover, IconButton, PopoverItem, Select, type SelectOption } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import {
  EMPTY_LIBRARY_FILTERS,
  hasActiveLibraryFilters,
  LIBRARY_SORTS,
  NO_WORKSPACE,
  SOURCE_KINDS,
  type LibraryFilters,
} from '../../utils/libraryCatalogFilters';
import type { SourceAvailability } from '../../services/vaultService';
import type { LibrarySavedView } from '../../services/librarySavedViewsService';

const AVAILABILITIES: SourceAvailability[] = [
  'catalogued',
  'partial',
  'complete',
];
/** "catalogued" si legge "solo online" nell'interfaccia: stessa etichetta della scheda. */
const AVAILABILITY_LABEL_KEY: Record<SourceAvailability, string> = {
  catalogued: 'filters.availabilityRemote',
  partial: 'filters.availabilityPartial',
  complete: 'filters.availabilityComplete',
};

interface LibraryFilterBarProps {
  filters: LibraryFilters;
  onChange: (filters: LibraryFilters) => void;
  languageOptions: string[];
  providerOptions: { key: string; label: string }[];
  collectionOptions: { id: string; name: string }[];
  workspaceOptions: { id: string; name: string }[];
  savedViews: LibrarySavedView[];
  onSaveView: (name: string) => void;
  onDeleteView: (viewId: string) => void;
}

/** Ricerca e filtri della Biblioteca: guardano il catalogo già caricato, non interrogano il backend. */
export function LibraryFilterBar({
  filters,
  onChange,
  languageOptions,
  providerOptions,
  collectionOptions,
  workspaceOptions,
  savedViews,
  onSaveView,
  onDeleteView,
}: LibraryFilterBarProps) {
  const { t } = useTranslation();
  const [viewsOpen, setViewsOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('');

  const kindOptions: SelectOption[] = [
    { value: '', label: t('areas.library.filters.allKinds') },
    ...SOURCE_KINDS.map((kind) => ({
      value: kind,
      label: t(`areas.library.kindLabels.${kind}`),
    })),
  ];

  const languageSelectOptions: SelectOption[] = [
    { value: '', label: t('areas.library.filters.allLanguages') },
    ...languageOptions.map((language) => ({
      value: language,
      label: language,
    })),
  ];

  const providerSelectOptions: SelectOption[] = [
    { value: '', label: t('areas.library.filters.allProviders') },
    ...providerOptions.map((provider) => ({
      value: provider.key,
      label: provider.label,
    })),
  ];

  const availabilitySelectOptions: SelectOption[] = [
    { value: '', label: t('areas.library.filters.allAvailability') },
    ...AVAILABILITIES.map((availability) => ({
      value: availability,
      label: t(`areas.library.${AVAILABILITY_LABEL_KEY[availability]}`),
    })),
  ];

  const collectionSelectOptions: SelectOption[] = [
    { value: '', label: t('areas.library.filters.allCollections') },
    ...collectionOptions.map((collection) => ({
      value: collection.id,
      label: collection.name,
    })),
  ];

  const workspaceSelectOptions: SelectOption[] = [
    { value: '', label: t('areas.library.filters.allWorkspaces') },
    ...workspaceOptions.map((workspace) => ({
      value: workspace.id,
      label: workspace.name,
    })),
    { value: NO_WORKSPACE, label: t('areas.library.filters.noWorkspace') },
  ];

  const sortSelectOptions: SelectOption[] = LIBRARY_SORTS.map((sort) => ({
    value: sort,
    label: t(`areas.library.filters.sort.${sort}`),
  }));

  const saveCurrentView = () => {
    const name = newViewName.trim();
    if (!name) return;
    onSaveView(name);
    setNewViewName('');
    setViewsOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 pb-3 md:px-6">
      <div className="relative min-w-[12rem] flex-1">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder={t('areas.library.filters.searchPlaceholder')}
          aria-label={t('areas.library.filters.searchLabel')}
          className={`${FIELD_CLASSNAME} py-1.5 pl-8 text-xs`}
        />
      </div>
      <Select
        value={filters.kind}
        onChange={(value) =>
          onChange({ ...filters, kind: value as LibraryFilters['kind'] })
        }
        options={kindOptions}
        ariaLabel={t('areas.library.filters.kindLabel')}
      />
      <Select
        value={filters.language}
        onChange={(value) => onChange({ ...filters, language: value })}
        options={languageSelectOptions}
        ariaLabel={t('areas.library.filters.languageLabel')}
      />
      <Select
        value={filters.providerKey}
        onChange={(value) => onChange({ ...filters, providerKey: value })}
        options={providerSelectOptions}
        ariaLabel={t('areas.library.filters.providerLabel')}
      />
      <Select
        value={filters.availability}
        onChange={(value) =>
          onChange({
            ...filters,
            availability: value as LibraryFilters['availability'],
          })
        }
        options={availabilitySelectOptions}
        ariaLabel={t('areas.library.filters.availabilityLabel')}
      />
      {workspaceOptions.length > 0 && (
        <Select
          value={filters.workspaceId}
          onChange={(value) => onChange({ ...filters, workspaceId: value })}
          options={workspaceSelectOptions}
          ariaLabel={t('areas.library.filters.workspaceLabel')}
        />
      )}
      {collectionOptions.length > 0 && (
        <Select
          value={filters.collectionId}
          onChange={(value) => onChange({ ...filters, collectionId: value })}
          options={collectionSelectOptions}
          ariaLabel={t('areas.library.filters.collectionLabel')}
        />
      )}
      <Select
        value={filters.sort}
        onChange={(value) =>
          onChange({ ...filters, sort: value as LibraryFilters['sort'] })
        }
        options={sortSelectOptions}
        ariaLabel={t('areas.library.filters.sortLabel')}
      />
      <ClickPopover
        open={viewsOpen}
        onOpenChange={setViewsOpen}
        trigger={
          <IconButton
            size="sm"
            title={t('areas.library.filters.savedViews')}
            ariaPressed={viewsOpen}
          >
            <Bookmark size={13} />
          </IconButton>
        }
      >
        <div className="flex min-w-56 flex-col gap-1 p-2">
          {savedViews.map((view) => (
            <div key={view.id} className="flex items-center gap-1">
              <PopoverItem
                label={view.name}
                onSelect={() => {
                  onChange(view.filters);
                  setViewsOpen(false);
                }}
              />
              <IconButton
                size="xs"
                tone="danger"
                onClick={() => onDeleteView(view.id)}
                title={t('areas.library.filters.deleteView', { name: view.name })}
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
          <div className="flex items-center gap-1">
            <input
              value={newViewName}
              onChange={(event) => setNewViewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveCurrentView();
              }}
              placeholder={t('areas.library.filters.newViewPlaceholder')}
              aria-label={t('areas.library.filters.newViewLabel')}
              className={`${FIELD_CLASSNAME} py-1 text-xs`}
            />
            <IconButton
              size="xs"
              tone="accent"
              disabled={newViewName.trim() === ''}
              onClick={saveCurrentView}
              title={t('areas.library.filters.saveView')}
            >
              <Bookmark size={12} />
            </IconButton>
          </div>
        </div>
      </ClickPopover>
      <IconButton
        size="sm"
        tone={filters.includeArchived ? 'accent' : 'default'}
        ariaPressed={filters.includeArchived}
        onClick={() => onChange({ ...filters, includeArchived: !filters.includeArchived })}
        title={t('areas.library.filters.showArchived')}
      >
        <Archive size={13} />
      </IconButton>
      {hasActiveLibraryFilters(filters) && (
        <IconButton
          size="sm"
          onClick={() => onChange(EMPTY_LIBRARY_FILTERS)}
          title={t('areas.library.filters.clear')}
        >
          <Eraser size={13} />
        </IconButton>
      )}
    </div>
  );
}
