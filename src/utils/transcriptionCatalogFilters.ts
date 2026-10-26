import type { TranscriptionCatalogEntry } from '../services/transcriptionCatalogService';
import { DAY_MS, RECENT_DAYS, centuryOfEntry, timestampOf } from './libraryCatalogFilters';
import { groupEntries, type CatalogGroup } from './catalogGrouping';
import { firstYear } from './workYear';
import { missingLast } from './compare';

/**
 * Gli scaffali fissi delle Trascrizioni. Le archiviate stanno solo nel loro
 * scaffale, come in Biblioteca.
 */
export const TRANSCRIPTION_SHELVES = ['all', 'recent', 'toStart', 'inProgress', 'verified', 'unlinked', 'archived'] as const;
export type TranscriptionShelf = (typeof TRANSCRIPTION_SHELVES)[number];

export const TRANSCRIPTION_SORTS = ['title', 'creator', 'year', 'edited', 'progress'] as const;
export type TranscriptionSort = (typeof TRANSCRIPTION_SORTS)[number];

export const TRANSCRIPTION_FACETS = ['workspaceId', 'providerKey', 'century'] as const;
export type TranscriptionFacet = (typeof TRANSCRIPTION_FACETS)[number];

export const TRANSCRIPTION_GROUPINGS = ['none', 'workspace', 'provider'] as const;
export type TranscriptionGrouping = (typeof TRANSCRIPTION_GROUPINGS)[number];

export interface TranscriptionFilters extends Record<TranscriptionFacet, string> {
  shelf: TranscriptionShelf;
  query: string;
  sort: TranscriptionSort;
}

export const EMPTY_TRANSCRIPTION_FILTERS: TranscriptionFilters = {
  shelf: 'all',
  query: '',
  workspaceId: '',
  providerKey: '',
  century: '',
  sort: 'title',
};

/** Quante pagine ha l'opera trascritta, se si sa. */
export function totalPagesOf(entry: TranscriptionCatalogEntry): number | null {
  return entry.work?.expectedPages ?? null;
}

/** Quanto è fatto, da 0 a 1: le pagine scritte sul totale dell'opera. Senza un
 *  totale noto, una pagina scritta vale tutto il documento. */
export function progressOf(entry: TranscriptionCatalogEntry): number {
  const total = totalPagesOf(entry);
  if (total && total > 0) return Math.min(1, entry.pagesWithText / total);
  return entry.pagesWithText > 0 ? 1 : 0;
}

/** Tutte le pagine verificate: quelle dell'opera, o quelle scritte se il totale non si sa. */
export function isFullyVerified(entry: TranscriptionCatalogEntry): boolean {
  if (entry.verifiedPages === 0) return false;
  const total = totalPagesOf(entry);
  return entry.verifiedPages >= (total && total > 0 ? total : entry.pagesWithText);
}

/** I filtri che restringono l'elenco dentro lo scaffale scelto. */
export function hasActiveTranscriptionFilters(filters: TranscriptionFilters): boolean {
  return filters.query.trim() !== '' || TRANSCRIPTION_FACETS.some((facet) => filters[facet] !== '');
}

function onShelf(entry: TranscriptionCatalogEntry, shelf: TranscriptionShelf, now: number): boolean {
  const archived = entry.document.status === 'archived';
  if (shelf === 'archived') return archived;
  if (archived) return false;
  switch (shelf) {
    case 'recent': return timestampOf(entry.lastEditedAt) >= now - RECENT_DAYS * DAY_MS;
    case 'toStart': return entry.pagesWithText === 0;
    case 'inProgress': return entry.pagesWithText > 0 && !isFullyVerified(entry);
    case 'verified': return isFullyVerified(entry);
    case 'unlinked': return entry.work === null;
    default: return true;
  }
}

export function facetValues(entry: TranscriptionCatalogEntry, facet: TranscriptionFacet): string[] {
  switch (facet) {
    case 'workspaceId': return [entry.document.workspace_id];
    case 'providerKey': return [entry.work?.providerKey ?? ''].filter(Boolean);
    case 'century': return entry.work ? [centuryOfEntry(entry.work)].filter(Boolean) : [];
  }
}

/** La ricerca guarda il nome della trascrizione e tutti i dati dell'opera. */
function matchesQuery(entry: TranscriptionCatalogEntry, query: string): boolean {
  const work = entry.work;
  return [entry.document.title, work?.source.title, ...(work ? Object.values(work.fields) : [])]
    .some((value) => value?.toLowerCase().includes(query));
}

/** L'elenco dentro lo scaffale scelto, con ricerca e filtri rapidi; `except`
 *  lascia fuori un filtro per contarne i valori. */
export function filterTranscriptionCatalog(
  catalog: TranscriptionCatalogEntry[],
  filters: TranscriptionFilters,
  now: number,
  except?: TranscriptionFacet,
): TranscriptionCatalogEntry[] {
  const query = filters.query.trim().toLowerCase();
  return catalog.filter((entry) =>
    onShelf(entry, filters.shelf, now)
    && (!query || matchesQuery(entry, query))
    && TRANSCRIPTION_FACETS.every((facet) =>
      facet === except || !filters[facet] || facetValues(entry, facet).includes(filters[facet])));
}

/** Quante trascrizioni per ogni valore di un filtro rapido, con gli altri già applicati. */
export function transcriptionFacetCounts(
  catalog: TranscriptionCatalogEntry[],
  filters: TranscriptionFilters,
  now: number,
  facet: TranscriptionFacet,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of filterTranscriptionCatalog(catalog, filters, now, facet)) {
    for (const value of facetValues(entry, facet)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Quante trascrizioni su ogni scaffale, senza ricerca né filtri. */
export function transcriptionShelfCounts(catalog: TranscriptionCatalogEntry[], now: number): Record<TranscriptionShelf, number> {
  return Object.fromEntries(TRANSCRIPTION_SHELVES.map((shelf) =>
    [shelf, catalog.filter((entry) => onShelf(entry, shelf, now)).length])) as Record<TranscriptionShelf, number>;
}

/** Nome, autore e anno in ordine crescente; ultima modifica e avanzamento dai più alti. */
export function orderTranscriptionCatalog(
  catalog: TranscriptionCatalogEntry[],
  sort: TranscriptionSort,
): TranscriptionCatalogEntry[] {
  const byText = (a: string, b: string) => a.localeCompare(b);
  const byTitle = (a: TranscriptionCatalogEntry, b: TranscriptionCatalogEntry) => byText(a.document.title, b.document.title);
  const compare: Record<TranscriptionSort, (a: TranscriptionCatalogEntry, b: TranscriptionCatalogEntry) => number> = {
    title: byTitle,
    creator: (a, b) => missingLast(a.work?.fields.creator || null, b.work?.fields.creator || null, byText),
    year: (a, b) => missingLast(firstYear(a.work?.fields.date ?? null), firstYear(b.work?.fields.date ?? null), (x, y) => x - y),
    edited: (a, b) => timestampOf(b.lastEditedAt) - timestampOf(a.lastEditedAt),
    progress: (a, b) => progressOf(b) - progressOf(a) || byTitle(a, b),
  };
  return [...catalog].sort(compare[sort]);
}

export function groupTranscriptionCatalog(
  entries: TranscriptionCatalogEntry[],
  by: TranscriptionGrouping,
  compareKeys: (a: string, b: string) => number,
): CatalogGroup<TranscriptionCatalogEntry>[] {
  if (by === 'none') return [{ key: '', entries }];
  return groupEntries(entries, (entry) => [
    by === 'workspace' ? entry.document.workspace_id : entry.work?.providerKey ?? '',
  ], compareKeys);
}
