import { Eraser, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Select } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import {
  EMPTY_LIBRARY_FILTERS,
  LIBRARY_FACETS,
  LIBRARY_SORTS,
  hasActiveLibraryFilters,
  type LibraryFacet,
  type LibraryFilters,
  type LibrarySort,
} from '../../utils/libraryCatalogFilters';
import { romanNumeral } from '../../utils/workYear';
import { LIBRARY_GROUPINGS, type LibraryGrouping } from '../../utils/libraryGrouping';

const AVAILABILITY_LABEL_KEY: Record<string, string> = {
  catalogued: 'areas.library.filters.availabilityRemote',
  partial: 'areas.library.filters.availabilityPartial',
  complete: 'areas.library.filters.availabilityComplete',
};

/**
 * Sopra l'elenco: la ricerca su tutti i dati, un filtro rapido per ogni
 * aspetto con quante opere ha ogni valore, l'ordine. I filtri restringono lo
 * scaffale o la raccolta scelti a sinistra.
 */
export function LibraryQuickFilters({ filters, onChange, counts, providerLabel, workspaceName, grouping, onGrouping }: {
  filters: LibraryFilters;
  onChange: (filters: LibraryFilters) => void;
  counts: Record<LibraryFacet, Map<string, number>>;
  providerLabel: (key: string) => string;
  workspaceName: (id: string) => string;
  grouping: LibraryGrouping;
  onGrouping: (grouping: LibraryGrouping) => void;
}) {
  const { t } = useTranslation();

  const valueLabel = (facet: LibraryFacet, value: string): string => {
    switch (facet) {
      case 'kind': return t(`areas.library.kindLabels.${value}`, { defaultValue: value });
      case 'century': return t('areas.library.filters.centuryValue', { century: romanNumeral(Number(value)) });
      case 'providerKey': return providerLabel(value);
      case 'availability': return t(AVAILABILITY_LABEL_KEY[value] ?? value);
      case 'workspaceId': return workspaceName(value);
      default: return value;
    }
  };

  const facetOptions = (facet: LibraryFacet) => {
    const values = [...counts[facet].keys()];
    if (filters[facet] && !values.includes(filters[facet])) values.push(filters[facet]);
    const sorted = facet === 'century'
      ? values.sort((a, b) => Number(a) - Number(b))
      : values.sort((a, b) => valueLabel(facet, a).localeCompare(valueLabel(facet, b)));
    return [
      { value: '', label: t(`areas.library.filters.all.${facet}`) },
      ...sorted.map((value) => ({ value, label: `${valueLabel(facet, value)} (${counts[facet].get(value) ?? 0})` })),
    ];
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-editorial-border px-5 py-2.5 md:px-6">
      <div className="relative min-w-[12rem] flex-1">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-editorial-muted" aria-hidden="true" />
        <input
          type="search"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
          placeholder={t('areas.library.filters.searchPlaceholder')}
          aria-label={t('areas.library.filters.searchLabel')}
          className={`${FIELD_CLASSNAME} py-1.5 pl-8 text-xs`}
        />
      </div>
      {LIBRARY_FACETS.filter((facet) => counts[facet].size > 0 || filters[facet]).map((facet) => (
        <Select
          key={facet}
          value={filters[facet]}
          onChange={(value) => onChange({ ...filters, [facet]: value })}
          options={facetOptions(facet)}
          ariaLabel={t(`areas.library.filters.facet.${facet}`)}
          className={`max-w-[11rem] ${filters[facet] ? 'border-editorial-accent text-editorial-accent' : ''}`}
        />
      ))}
      <Select
        value={filters.sort}
        onChange={(sort) => onChange({ ...filters, sort: sort as LibrarySort })}
        options={LIBRARY_SORTS.map((sort) => ({ value: sort, label: t(`areas.library.filters.sort.${sort}`) }))}
        ariaLabel={t('areas.library.filters.sortLabel')}
        className="max-w-[11rem]"
      />
      <Select
        value={grouping}
        onChange={(value) => onGrouping(value as LibraryGrouping)}
        options={LIBRARY_GROUPINGS.map((value) => ({ value, label: t(`areas.library.grouping.${value}`) }))}
        ariaLabel={t('areas.library.grouping.label')}
        className="max-w-[11rem]"
      />
      {hasActiveLibraryFilters(filters) && (
        <IconButton size="sm" title={t('areas.library.filters.clear')}
          onClick={() => onChange({ ...EMPTY_LIBRARY_FILTERS, shelf: filters.shelf, collectionId: filters.collectionId, sort: filters.sort })}>
          <Eraser size={13} />
        </IconButton>
      )}
    </div>
  );
}
