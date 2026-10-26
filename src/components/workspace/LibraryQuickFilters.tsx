import { Eraser } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CatalogSearchField, IconButton, Select } from '../ui';
import { ACTIVE_FILTER_CLASSNAME, QUICK_FILTER_CLASSNAME } from '../ui/catalogStyles';
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
 * Sopra l'elenco: la ricerca su tutti i dati in una riga sua, sotto un filtro
 * rapido per ogni aspetto con quante opere ha ogni valore, l'ordine. I filtri
 * restringono lo scaffale o la raccolta scelti a destra.
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
    <div className="flex flex-col gap-2 border-b border-editorial-border px-5 py-2.5 md:px-6">
      <CatalogSearchField
        value={filters.query}
        onChange={(query) => onChange({ ...filters, query })}
        placeholder={t('areas.library.filters.searchPlaceholder')}
        label={t('areas.library.filters.searchLabel')}
      />
      <div className="flex flex-wrap items-center gap-2">
      {LIBRARY_FACETS.filter((facet) => counts[facet].size > 0 || filters[facet]).map((facet) => (
        <Select
          key={facet}
          value={filters[facet]}
          onChange={(value) => onChange({ ...filters, [facet]: value })}
          options={facetOptions(facet)}
          ariaLabel={t(`areas.library.filters.facet.${facet}`)}
          className={`${QUICK_FILTER_CLASSNAME} ${filters[facet] ? ACTIVE_FILTER_CLASSNAME : ''}`}
        />
      ))}
      <Select
        value={filters.sort}
        onChange={(sort) => onChange({ ...filters, sort: sort as LibrarySort })}
        options={LIBRARY_SORTS.map((sort) => ({ value: sort, label: t(`areas.library.filters.sort.${sort}`) }))}
        ariaLabel={t('areas.library.filters.sortLabel')}
        className={QUICK_FILTER_CLASSNAME}
      />
      <Select
        value={grouping}
        onChange={(value) => onGrouping(value as LibraryGrouping)}
        options={LIBRARY_GROUPINGS.map((value) => ({ value, label: t(`areas.library.grouping.${value}`) }))}
        ariaLabel={t('areas.library.grouping.label')}
        className={QUICK_FILTER_CLASSNAME}
      />
      {hasActiveLibraryFilters(filters) && (
        <IconButton size="sm" title={t('areas.library.filters.clear')}
          onClick={() => onChange({ ...EMPTY_LIBRARY_FILTERS, shelf: filters.shelf, collectionId: filters.collectionId, sort: filters.sort })}>
          <Eraser size={13} />
        </IconButton>
      )}
      </div>
    </div>
  );
}
