import { Eraser } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CatalogSearchField, IconButton, Select } from '../ui';
import { ACTIVE_FILTER_CLASSNAME, QUICK_FILTER_CLASSNAME } from '../ui/catalogStyles';
import {
  EMPTY_TRANSLATION_FILTERS,
  TRANSLATION_FACETS,
  TRANSLATION_GROUPINGS,
  TRANSLATION_SORTS,
  hasActiveTranslationFilters,
  type TranslationFacet,
  type TranslationFilters,
  type TranslationGrouping,
  type TranslationSort,
} from '../../utils/translationCatalogFilters';

/**
 * Sopra l'elenco, come nelle Trascrizioni: la ricerca in una riga sua, sotto
 * workspace e coppia di lingue con quante traduzioni ha ogni valore, l'ordine
 * e il raggruppamento.
 */
export function TranslationQuickFilters({ filters, onChange, counts, valueLabel, grouping, onGrouping }: {
  filters: TranslationFilters;
  onChange: (filters: TranslationFilters) => void;
  counts: Record<TranslationFacet, Map<string, number>>;
  valueLabel: (facet: TranslationFacet, value: string) => string;
  grouping: TranslationGrouping;
  onGrouping: (grouping: TranslationGrouping) => void;
}) {
  const { t } = useTranslation();

  const facetOptions = (facet: TranslationFacet) => {
    const values = [...counts[facet].keys()];
    if (filters[facet] && !values.includes(filters[facet])) values.push(filters[facet]);
    const sorted = [...values].sort((a, b) => valueLabel(facet, a).localeCompare(valueLabel(facet, b)));
    return [
      { value: '', label: t(`areas.translations.catalog.filters.all.${facet}`) },
      ...sorted.map((value) => ({ value, label: `${valueLabel(facet, value)} (${counts[facet].get(value) ?? 0})` })),
    ];
  };

  return (
    <div className="flex flex-col gap-2 border-b border-editorial-border px-5 py-2.5 md:px-6">
      <CatalogSearchField
        value={filters.query}
        onChange={(query: string) => onChange({ ...filters, query })}
        placeholder={t('areas.translations.catalog.filters.searchPlaceholder')}
        label={t('areas.translations.catalog.filters.searchLabel')}
      />
      <div className="flex flex-wrap items-center gap-2">
        {TRANSLATION_FACETS.filter((facet) => counts[facet].size > 0 || filters[facet]).map((facet) => (
          <Select
            key={facet}
            value={filters[facet]}
            onChange={(value) => onChange({ ...filters, [facet]: value })}
            options={facetOptions(facet)}
            ariaLabel={t(`areas.translations.catalog.filters.facet.${facet}`)}
            className={`${QUICK_FILTER_CLASSNAME} ${filters[facet] ? ACTIVE_FILTER_CLASSNAME : ''}`}
          />
        ))}
        <Select
          value={filters.sort}
          onChange={(sort) => onChange({ ...filters, sort: sort as TranslationSort })}
          options={TRANSLATION_SORTS.map((sort) => ({ value: sort, label: t(`areas.translations.catalog.filters.sort.${sort}`) }))}
          ariaLabel={t('areas.translations.catalog.filters.sortLabel')}
          className={QUICK_FILTER_CLASSNAME}
        />
        <Select
          value={grouping}
          onChange={(value) => onGrouping(value as TranslationGrouping)}
          options={TRANSLATION_GROUPINGS.map((value) => ({ value, label: t(`areas.translations.catalog.grouping.${value}`) }))}
          ariaLabel={t('areas.translations.catalog.grouping.label')}
          className={QUICK_FILTER_CLASSNAME}
        />
        {hasActiveTranslationFilters(filters) && (
          <IconButton size="sm" title={t('areas.translations.catalog.filters.clear')}
            onClick={() => onChange({ ...EMPTY_TRANSLATION_FILTERS, shelf: filters.shelf, sort: filters.sort })}>
            <Eraser size={13} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
