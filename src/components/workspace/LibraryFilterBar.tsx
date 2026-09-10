import { useState } from 'react';
import { Archive, Bookmark, Eraser, Search, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  FieldLabel,
  IconButton,
  PopoverItem,
  SectionLabel,
  Select,
  ToggleRow,
  type SelectOption,
} from '../ui';
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

const AVAILABILITIES: SourceAvailability[] = ['catalogued', 'partial', 'complete'];

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

/** Filtri del catalogo: vivono in una colonna propria, quindi restano leggibili
 *  e non comprimono l'elenco in una seconda riga di controlli. */
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
    ...languageOptions.map((language) => ({ value: language, label: language })),
  ];
  const providerSelectOptions: SelectOption[] = [
    { value: '', label: t('areas.library.filters.allProviders') },
    ...providerOptions.map((provider) => ({ value: provider.key, label: provider.label })),
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
    ...collectionOptions.map((collection) => ({ value: collection.id, label: collection.name })),
  ];
  const workspaceSelectOptions: SelectOption[] = [
    { value: '', label: t('areas.library.filters.allWorkspaces') },
    ...workspaceOptions.map((workspace) => ({ value: workspace.id, label: workspace.name })),
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
  };

  const selectField = (
    label: string,
    value: string,
    options: SelectOption[],
    onSelect: (value: string) => void,
  ) => (
    <label className="space-y-1.5">
      <FieldLabel block>{label}</FieldLabel>
      <Select
        value={value}
        onChange={onSelect}
        options={options}
        ariaLabel={label}
        className="w-full"
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-6 px-4 py-5">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder={t('areas.library.filters.searchPlaceholder')}
          aria-label={t('areas.library.filters.searchLabel')}
          className={`${FIELD_CLASSNAME} py-1.5 pl-8 text-xs`}
        />
      </div>

      <div className="space-y-4">
        {selectField(
          t('areas.library.filters.kindLabel'),
          filters.kind,
          kindOptions,
          (kind) => onChange({ ...filters, kind: kind as LibraryFilters['kind'] }),
        )}
        {selectField(
          t('areas.library.filters.languageLabel'),
          filters.language,
          languageSelectOptions,
          (language) => onChange({ ...filters, language }),
        )}
        {selectField(
          t('areas.library.filters.providerLabel'),
          filters.providerKey,
          providerSelectOptions,
          (providerKey) => onChange({ ...filters, providerKey }),
        )}
        {selectField(
          t('areas.library.filters.availabilityLabel'),
          filters.availability,
          availabilitySelectOptions,
          (availability) =>
            onChange({
              ...filters,
              availability: availability as LibraryFilters['availability'],
            }),
        )}
        {workspaceOptions.length > 0 &&
          selectField(
            t('areas.library.filters.workspaceLabel'),
            filters.workspaceId,
            workspaceSelectOptions,
            (workspaceId) => onChange({ ...filters, workspaceId }),
          )}
        {collectionOptions.length > 0 &&
          selectField(
            t('areas.library.filters.collectionLabel'),
            filters.collectionId,
            collectionSelectOptions,
            (collectionId) => onChange({ ...filters, collectionId }),
          )}
        {selectField(
          t('areas.library.filters.sortLabel'),
          filters.sort,
          sortSelectOptions,
          (sort) => onChange({ ...filters, sort: sort as LibraryFilters['sort'] }),
        )}
        <div className="border-y border-editorial-border/70 py-2.5">
          <ToggleRow
            icon={<Archive size={13} />}
            label={t('areas.library.filters.showArchived')}
            checked={filters.includeArchived}
            onChange={() =>
              onChange({ ...filters, includeArchived: !filters.includeArchived })
            }
          />
        </div>
      </div>

      <section className="space-y-3">
        <SectionLabel icon={Bookmark} label={t('areas.library.filters.savedViews')} />
        {savedViews.length > 0 && (
          <div className="divide-y divide-editorial-border/60 border-y border-editorial-border/70">
            {savedViews.map((view) => (
              <div key={view.id} className="flex items-center gap-1 py-1">
                <PopoverItem label={view.name} onSelect={() => onChange(view.filters)} />
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
          </div>
        )}
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
      </section>

      {hasActiveLibraryFilters(filters) && (
        <div className="flex justify-end border-t border-editorial-border/70 pt-3">
          <IconButton
            size="sm"
            onClick={() => onChange(EMPTY_LIBRARY_FILTERS)}
            title={t('areas.library.filters.clear')}
          >
            <Eraser size={13} />
          </IconButton>
        </div>
      )}
    </div>
  );
}
