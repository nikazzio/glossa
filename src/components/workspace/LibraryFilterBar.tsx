import { Eraser, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, Select, type SelectOption } from '../ui';
import { FIELD_CLASSNAME } from '../ui/fieldStyles';
import {
  hasActiveLibraryFilters,
  type LibraryFilters,
} from '../../utils/libraryCatalogFilters';
import type { SourceAvailability } from '../../services/vaultService';
import type { SourceKind } from '../../types';

const SOURCE_KINDS: SourceKind[] = [
  'manuscript',
  'print',
  'pdf',
  'iiif',
  'web',
  'other',
];
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
}

/** Ricerca e filtri della Biblioteca: guardano il catalogo già caricato, non interrogano il backend. */
export function LibraryFilterBar({
  filters,
  onChange,
  languageOptions,
  providerOptions,
}: LibraryFilterBarProps) {
  const { t } = useTranslation();

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
      {hasActiveLibraryFilters(filters) && (
        <IconButton
          size="sm"
          onClick={() =>
            onChange({
              query: '',
              kind: '',
              language: '',
              providerKey: '',
              availability: '',
            })
          }
          title={t('areas.library.filters.clear')}
        >
          <Eraser size={13} />
        </IconButton>
      )}
    </div>
  );
}
