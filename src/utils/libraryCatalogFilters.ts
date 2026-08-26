import {
  summarizeAvailability,
  type SourceAvailability,
} from '../services/vaultService';
import type { LibraryCatalogEntry, SourceKind } from '../types';

export interface LibraryFilters {
  query: string;
  kind: SourceKind | '';
  language: string | '';
  providerKey: string | '';
  availability: SourceAvailability | '';
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  query: '',
  kind: '',
  language: '',
  providerKey: '',
  availability: '',
};

export function hasActiveLibraryFilters(filters: LibraryFilters): boolean {
  return Object.values(filters).some((value) => value !== '');
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
    if (query && !matchesQuery(entry, query)) return false;
    if (filters.kind && entry.source.kind !== filters.kind) return false;
    if (filters.language && entry.source.primaryLanguage !== filters.language)
      return false;
    if (filters.providerKey && entry.providerKey !== filters.providerKey)
      return false;
    if (filters.availability && availabilityOf(entry) !== filters.availability)
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
