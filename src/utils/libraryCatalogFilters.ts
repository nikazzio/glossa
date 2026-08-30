import {
  summarizeAvailability,
  type SourceAvailability,
} from '../services/vaultService';
import type { LibraryCatalogEntry, SourceKind } from '../types';

/** I tipi di opera ammessi dallo schema, nell'ordine in cui si mostrano. */
export const SOURCE_KINDS: SourceKind[] = ['manuscript', 'print', 'pdf', 'iiif', 'web', 'other'];

export interface LibraryFilters {
  query: string;
  kind: SourceKind | '';
  language: string | '';
  providerKey: string | '';
  availability: SourceAvailability | '';
  /** Le archiviate stanno fuori dai risultati finché non si chiede di vederle. */
  includeArchived: boolean;
  collectionId: string | '';
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  query: '',
  kind: '',
  language: '',
  providerKey: '',
  availability: '',
  includeArchived: false,
  collectionId: '',
};

export function hasActiveLibraryFilters(filters: LibraryFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.includeArchived ||
    filters.kind !== '' ||
    filters.language !== '' ||
    filters.providerKey !== '' ||
    filters.availability !== '' ||
    filters.collectionId !== ''
  );
}

/**
 * Rilegge filtri salvati tempo fa: si prende solo ciò che si riconosce, e
 * quello che manca torna al valore neutro. Una vista scritta quando i filtri
 * erano altri deve valere ancora, non far saltare l'elenco.
 */
export function parseLibraryFilters(raw: string): LibraryFilters | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    return {
      query: text(record.query),
      kind: (SOURCE_KINDS as string[]).includes(text(record.kind))
        ? (record.kind as SourceKind)
        : '',
      language: text(record.language),
      providerKey: text(record.providerKey),
      availability: (['catalogued', 'partial', 'complete'] as string[]).includes(
        text(record.availability),
      )
        ? (record.availability as SourceAvailability)
        : '',
      includeArchived: record.includeArchived === true,
      collectionId: text(record.collectionId),
    };
  } catch {
    return null;
  }
}

/**
 * Disponibilità della copia, con la stessa logica che mostra la scheda:
 * dal deposito, non da uno stato salvato a parte.
 */
export function availabilityOf(entry: LibraryCatalogEntry): SourceAvailability {
  const principal = entry.sizes.find(
    (size) => size.sizeTag === entry.principalSize,
  );
  const notServed = principal?.missing ?? 0;
  return summarizeAvailability(
    entry.localPages,
    entry.expectedPages ?? 0,
    notServed,
  ).availability;
}

function matchesQuery(entry: LibraryCatalogEntry, query: string): boolean {
  const haystack = [entry.source.title, entry.creator]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function filterLibraryCatalog(
  catalog: LibraryCatalogEntry[],
  filters: LibraryFilters,
): LibraryCatalogEntry[] {
  const query = filters.query.trim().toLowerCase();
  return catalog.filter((entry) => {
    if (!filters.includeArchived && entry.source.status === 'archived') return false;
    if (query && !matchesQuery(entry, query)) return false;
    if (filters.kind && entry.source.kind !== filters.kind) return false;
    if (filters.language && entry.source.primaryLanguage !== filters.language)
      return false;
    if (filters.providerKey && entry.providerKey !== filters.providerKey)
      return false;
    if (filters.availability && availabilityOf(entry) !== filters.availability)
      return false;
    if (
      filters.collectionId &&
      !entry.collections.some((collection) => collection.id === filters.collectionId)
    )
      return false;
    return true;
  });
}

/** Lingue davvero presenti nel catalogo, per non offrire scelte vuote. */
export function libraryLanguageOptions(
  catalog: LibraryCatalogEntry[],
): string[] {
  const languages = new Set<string>();
  for (const entry of catalog) {
    if (entry.source.primaryLanguage)
      languages.add(entry.source.primaryLanguage);
  }
  return [...languages].sort((a, b) => a.localeCompare(b));
}
