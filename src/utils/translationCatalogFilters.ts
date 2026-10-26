import type { TranslationCatalogEntry } from '../services/translationCatalogService';
import { DAY_MS, RECENT_DAYS, timestampOf } from './libraryCatalogFilters';
import { groupEntries, type CatalogGroup } from './catalogGrouping';

/** Gli scaffali fissi delle Traduzioni. */
export const TRANSLATION_SHELVES = ['all', 'recent', 'toStart', 'inProgress', 'verified'] as const;
export type TranslationShelf = (typeof TRANSLATION_SHELVES)[number];

export const TRANSLATION_SORTS = ['name', 'edited', 'progress'] as const;
export type TranslationSort = (typeof TRANSLATION_SORTS)[number];

export const TRANSLATION_FACETS = ['workspaceId', 'languagePair'] as const;
export type TranslationFacet = (typeof TRANSLATION_FACETS)[number];

export const TRANSLATION_GROUPINGS = ['none', 'workspace', 'languagePair'] as const;
export type TranslationGrouping = (typeof TRANSLATION_GROUPINGS)[number];

export interface TranslationFilters extends Record<TranslationFacet, string> {
  shelf: TranslationShelf;
  query: string;
  sort: TranslationSort;
}

export const EMPTY_TRANSLATION_FILTERS: TranslationFilters = {
  shelf: 'all',
  query: '',
  workspaceId: '',
  languagePair: '',
  sort: 'edited',
};

/** Separatore della chiave di una coppia di lingue: non compare nei nomi delle lingue. */
const PAIR_SEPARATOR = '\u0000';

export function languagePairKey(entry: TranslationCatalogEntry): string {
  return `${entry.sourceLanguage}${PAIR_SEPARATOR}${entry.targetLanguage}`;
}

export function splitLanguagePair(key: string): [string, string] {
  const [source = '', target = ''] = key.split(PAIR_SEPARATOR);
  return [source, target];
}

/** Quanto è tradotto, da 0 a 1. */
export function translatedRatio(entry: TranslationCatalogEntry): number {
  return entry.chunkCount > 0 ? entry.translatedChunks / entry.chunkCount : 0;
}

/** Tutti i frammenti verificati. */
export function isFullyVerified(entry: TranslationCatalogEntry): boolean {
  return entry.chunkCount > 0 && entry.verifiedChunks >= entry.chunkCount;
}

/** I filtri che restringono l'elenco dentro lo scaffale scelto. */
export function hasActiveTranslationFilters(filters: TranslationFilters): boolean {
  return filters.query.trim() !== '' || TRANSLATION_FACETS.some((facet) => filters[facet] !== '');
}

function onShelf(entry: TranslationCatalogEntry, shelf: TranslationShelf, now: number): boolean {
  switch (shelf) {
    case 'recent': return timestampOf(entry.updatedAt) >= now - RECENT_DAYS * DAY_MS;
    case 'toStart': return entry.translatedChunks === 0;
    case 'inProgress': return entry.translatedChunks > 0 && !isFullyVerified(entry);
    case 'verified': return isFullyVerified(entry);
    default: return true;
  }
}

function facetValue(entry: TranslationCatalogEntry, facet: TranslationFacet): string {
  return facet === 'workspaceId' ? entry.workspaceId : languagePairKey(entry);
}

/** L'elenco dentro lo scaffale scelto, con ricerca e filtri rapidi; `except`
 *  lascia fuori un filtro per contarne i valori. */
export function filterTranslationCatalog(
  catalog: TranslationCatalogEntry[],
  filters: TranslationFilters,
  now: number,
  except?: TranslationFacet,
): TranslationCatalogEntry[] {
  const query = filters.query.trim().toLowerCase();
  return catalog.filter((entry) =>
    onShelf(entry, filters.shelf, now)
    && (!query || entry.name.toLowerCase().includes(query))
    && TRANSLATION_FACETS.every((facet) =>
      facet === except || !filters[facet] || facetValue(entry, facet) === filters[facet]));
}

/** Quante traduzioni per ogni valore di un filtro rapido, con gli altri già applicati. */
export function translationFacetCounts(
  catalog: TranslationCatalogEntry[],
  filters: TranslationFilters,
  now: number,
  facet: TranslationFacet,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of filterTranslationCatalog(catalog, filters, now, facet)) {
    const value = facetValue(entry, facet);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Quante traduzioni su ogni scaffale, senza ricerca né filtri. */
export function translationShelfCounts(catalog: TranslationCatalogEntry[], now: number): Record<TranslationShelf, number> {
  return Object.fromEntries(TRANSLATION_SHELVES.map((shelf) =>
    [shelf, catalog.filter((entry) => onShelf(entry, shelf, now)).length])) as Record<TranslationShelf, number>;
}

/** Nome in ordine crescente; ultima modifica e avanzamento dai più alti. */
export function orderTranslationCatalog(
  catalog: TranslationCatalogEntry[],
  sort: TranslationSort,
): TranslationCatalogEntry[] {
  const byName = (a: TranslationCatalogEntry, b: TranslationCatalogEntry) => a.name.localeCompare(b.name);
  const compare: Record<TranslationSort, (a: TranslationCatalogEntry, b: TranslationCatalogEntry) => number> = {
    name: byName,
    edited: (a, b) => timestampOf(b.updatedAt) - timestampOf(a.updatedAt),
    progress: (a, b) => translatedRatio(b) - translatedRatio(a) || byName(a, b),
  };
  return [...catalog].sort(compare[sort]);
}

export function groupTranslationCatalog(
  entries: TranslationCatalogEntry[],
  by: TranslationGrouping,
  compareKeys: (a: string, b: string) => number,
): CatalogGroup<TranslationCatalogEntry>[] {
  if (by === 'none') return [{ key: '', entries }];
  return groupEntries(entries, (entry) => [by === 'workspace' ? entry.workspaceId : languagePairKey(entry)], compareKeys);
}
