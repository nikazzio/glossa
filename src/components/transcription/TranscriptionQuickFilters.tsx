import { Eraser } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CatalogSearchField, IconButton, Select } from '../ui';
import { ACTIVE_FILTER_CLASSNAME, QUICK_FILTER_CLASSNAME } from '../ui/catalogStyles';
import { romanNumeral } from '../../utils/workYear';
import {
  EMPTY_TRANSCRIPTION_FILTERS,
  TRANSCRIPTION_FACETS,
  TRANSCRIPTION_GROUPINGS,
  TRANSCRIPTION_SORTS,
  hasActiveTranscriptionFilters,
  type TranscriptionFacet,
  type TranscriptionFilters,
  type TranscriptionGrouping,
  type TranscriptionSort,
} from '../../utils/transcriptionCatalogFilters';

/**
 * Sopra l'elenco, come in Biblioteca: la ricerca in una riga sua, sotto un
 * filtro rapido per aspetto con quante trascrizioni ha ogni valore, l'ordine e
 * il raggruppamento.
 */
export function TranscriptionQuickFilters({ filters, onChange, counts, providerLabel, workspaceName, grouping, onGrouping }: {
  filters: TranscriptionFilters;
  onChange: (filters: TranscriptionFilters) => void;
  counts: Record<TranscriptionFacet, Map<string, number>>;
  providerLabel: (key: string) => string;
  workspaceName: (id: string) => string;
  grouping: TranscriptionGrouping;
  onGrouping: (grouping: TranscriptionGrouping) => void;
}) {
  const { t } = useTranslation();

  const valueLabel = (facet: TranscriptionFacet, value: string): string => {
    switch (facet) {
      case 'century': return t('areas.library.filters.centuryValue', { century: romanNumeral(Number(value)) });
      case 'providerKey': return providerLabel(value);
      case 'workspaceId': return workspaceName(value);
    }
  };

  const facetOptions = (facet: TranscriptionFacet) => {
    const values = [...counts[facet].keys()];
    if (filters[facet] && !values.includes(filters[facet])) values.push(filters[facet]);
    const sorted = facet === 'century'
      ? values.sort((a, b) => Number(a) - Number(b))
      : values.sort((a, b) => valueLabel(facet, a).localeCompare(valueLabel(facet, b)));
    return [
      { value: '', label: t(`areas.transcriptions.catalog.filters.all.${facet}`) },
      ...sorted.map((value) => ({ value, label: `${valueLabel(facet, value)} (${counts[facet].get(value) ?? 0})` })),
    ];
  };

  return (
    <div className="flex flex-col gap-2 border-b border-editorial-border px-5 py-2.5 md:px-6">
      <CatalogSearchField
        value={filters.query}
        onChange={(query) => onChange({ ...filters, query })}
        placeholder={t('areas.transcriptions.catalog.filters.searchPlaceholder')}
        label={t('areas.transcriptions.catalog.filters.searchLabel')}
      />
      <div className="flex flex-wrap items-center gap-2">
        {TRANSCRIPTION_FACETS.filter((facet) => counts[facet].size > 0 || filters[facet]).map((facet) => (
          <Select
            key={facet}
            value={filters[facet]}
            onChange={(value) => onChange({ ...filters, [facet]: value })}
            options={facetOptions(facet)}
            ariaLabel={t(`areas.transcriptions.catalog.filters.facet.${facet}`)}
            className={`${QUICK_FILTER_CLASSNAME} ${filters[facet] ? ACTIVE_FILTER_CLASSNAME : ''}`}
          />
        ))}
        <Select
          value={filters.sort}
          onChange={(sort) => onChange({ ...filters, sort: sort as TranscriptionSort })}
          options={TRANSCRIPTION_SORTS.map((sort) => ({ value: sort, label: t(`areas.transcriptions.catalog.filters.sort.${sort}`) }))}
          ariaLabel={t('areas.transcriptions.catalog.filters.sortLabel')}
          className={QUICK_FILTER_CLASSNAME}
        />
        <Select
          value={grouping}
          onChange={(value) => onGrouping(value as TranscriptionGrouping)}
          options={TRANSCRIPTION_GROUPINGS.map((value) => ({ value, label: t(`areas.transcriptions.catalog.grouping.${value}`) }))}
          ariaLabel={t('areas.transcriptions.catalog.grouping.label')}
          className={QUICK_FILTER_CLASSNAME}
        />
        {hasActiveTranscriptionFilters(filters) && (
          <IconButton size="sm" title={t('areas.transcriptions.catalog.filters.clear')}
            onClick={() => onChange({ ...EMPTY_TRANSCRIPTION_FILTERS, shelf: filters.shelf, sort: filters.sort })}>
            <Eraser size={13} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
