import {
  summarizeAvailability,
  type SourceAvailability,
} from '../services/vaultService';
import type { LibraryCatalogEntry, SourceKind } from '../types';
import { centuryOf, firstYear } from './workYear';
import { missingLast } from './compare';

/**
 * Gli scaffali fissi della Biblioteca: modi di guardare il catalogo che non
 * chiedono di costruire un filtro. Le archiviate stanno solo nel loro scaffale.
 */
export const LIBRARY_SHELVES = ['all', 'recent', 'toDownload', 'transcribing', 'unlinked', 'archived'] as const;
export type LibraryShelf = (typeof LIBRARY_SHELVES)[number];

/** «Recenti»: aggiunte o aperte in questi giorni. */
export const RECENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Come si ordina il catalogo. Il titolo è il punto di partenza: è il modo in
 *  cui si cerca un libro a occhio su uno scaffale. */
export const LIBRARY_SORTS = ['title', 'creator', 'year', 'added', 'opened'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** Le nature d'origine riconosciute in automatico, nell'ordine del filtro. Il
 *  campo resta semi-libero: non è un enum chiuso a livello di dato. */
export const SOURCE_KINDS: SourceKind[] = ['manuscript', 'print', 'other'];

/** I filtri rapidi sopra l'elenco: ognuno conta le opere per ogni suo valore. */
export const LIBRARY_FACETS = ['kind', 'century', 'language', 'providerKey', 'availability', 'workspaceId'] as const;
export type LibraryFacet = (typeof LIBRARY_FACETS)[number];

export interface LibraryFilters extends Record<LibraryFacet, string> {
  shelf: LibraryShelf;
  /** Una raccolta scelta nella colonna degli scaffali; vuoto = nessuna. */
  collectionId: string;
  query: string;
  sort: LibrarySort;
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  shelf: 'all',
  collectionId: '',
  query: '',
  kind: '',
  century: '',
  language: '',
  providerKey: '',
  availability: '',
  workspaceId: '',
  sort: 'title',
};

/** Quello che serve a decidere cosa è recente: l'ora di adesso e quando è
 *  stata aperta l'ultima volta ogni opera. */
export interface CatalogClock {
  now: number;
  openedAt: Readonly<Record<string, string>>;
}

/** I filtri che restringono l'elenco dentro lo scaffale scelto. */
export function hasActiveLibraryFilters(filters: LibraryFilters): boolean {
  return filters.query.trim() !== '' || LIBRARY_FACETS.some((facet) => filters[facet] !== '');
}

/**
 * Rilegge filtri salvati: si prende solo ciò che si riconosce, e quello che
 * manca torna al valore neutro.
 */
export function parseLibraryFilters(raw: string): LibraryFilters | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    const text = (key: string) => (typeof record[key] === 'string' ? (record[key] as string) : '');
    const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T =>
      (values as readonly string[]).includes(value) ? (value as T) : fallback;
    return {
      ...EMPTY_LIBRARY_FILTERS,
      ...Object.fromEntries(LIBRARY_FACETS.map((facet) => [facet, text(facet)])),
      shelf: oneOf(LIBRARY_SHELVES, text('shelf'), 'all'),
      collectionId: text('collectionId'),
      query: text('query'),
      sort: oneOf(LIBRARY_SORTS, text('sort'), 'title'),
    };
  } catch {
    return null;
  }
}

/**
 * Disponibilità della copia, con la stessa logica della scheda: dal deposito,
 * non da uno stato salvato a parte.
 */
export function availabilityOf(entry: LibraryCatalogEntry): SourceAvailability {
  const principal = entry.sizes.find((size) => size.sizeTag === entry.principalSize);
  return summarizeAvailability(entry.localPages, entry.expectedPages ?? 0, principal?.missing ?? 0).availability;
}

/** Il secolo dell'opera, dalla data dichiarata; vuoto se la data non ha un anno. */
export function centuryOfEntry(entry: LibraryCatalogEntry): string {
  const year = firstYear(entry.fields.date);
  return year === null ? '' : String(centuryOf(year));
}

/** SQLite scrive «2026-09-25 10:00:00» in UTC, senza dirlo. */
function timestampOf(value: string): number {
  return Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
}

function isRecent(entry: LibraryCatalogEntry, clock: CatalogClock): boolean {
  const since = clock.now - RECENT_DAYS * DAY_MS;
  const opened = clock.openedAt[entry.source.id];
  return timestampOf(entry.source.createdAt) >= since || (opened !== undefined && timestampOf(opened) >= since);
}

function onShelf(entry: LibraryCatalogEntry, shelf: LibraryShelf, clock: CatalogClock): boolean {
  const archived = entry.source.status === 'archived';
  if (shelf === 'archived') return archived;
  if (archived) return false;
  switch (shelf) {
    case 'recent': return isRecent(entry, clock);
    case 'toDownload': return availabilityOf(entry) !== 'complete';
    case 'transcribing': return entry.stage === 'transcribing';
    case 'unlinked': return entry.workspaces.length === 0;
    default: return true;
  }
}

/** I valori di un filtro rapido per un'opera: i workspace possono essere più d'uno. */
export function facetValues(entry: LibraryCatalogEntry, facet: LibraryFacet): string[] {
  switch (facet) {
    case 'kind': return [entry.source.kind];
    case 'century': return [centuryOfEntry(entry)].filter(Boolean);
    case 'language': return [entry.source.primaryLanguage ?? ''].filter(Boolean);
    case 'providerKey': return [entry.providerKey ?? ''].filter(Boolean);
    case 'availability': return [availabilityOf(entry)];
    case 'workspaceId': return entry.workspaces.map((link) => link.workspaceId);
  }
}

/** La ricerca interna guarda tutti i dati dell'opera, non solo titolo e autore. */
function matchesQuery(entry: LibraryCatalogEntry, query: string): boolean {
  return [entry.source.title, entry.source.externalRef, ...Object.values(entry.fields)]
    .some((value) => value?.toLowerCase().includes(query));
}

/**
 * L'elenco dentro lo scaffale o la raccolta scelti, con ricerca e filtri
 * rapidi. `except` lascia fuori un filtro: serve a contare le opere per ogni
 * suo valore senza che il valore già scelto azzeri gli altri.
 */
export function filterLibraryCatalog(
  catalog: LibraryCatalogEntry[],
  filters: LibraryFilters,
  clock: CatalogClock,
  except?: LibraryFacet,
): LibraryCatalogEntry[] {
  const query = filters.query.trim().toLowerCase();
  return catalog.filter((entry) =>
    onShelf(entry, filters.shelf, clock)
    && (!filters.collectionId || entry.collections.some((collection) => collection.id === filters.collectionId))
    && (!query || matchesQuery(entry, query))
    && LIBRARY_FACETS.every((facet) =>
      facet === except || !filters[facet] || facetValues(entry, facet).includes(filters[facet])));
}

/** Quante opere per ogni valore di un filtro rapido, con gli altri filtri già applicati. */
export function facetCounts(
  catalog: LibraryCatalogEntry[],
  filters: LibraryFilters,
  clock: CatalogClock,
  facet: LibraryFacet,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of filterLibraryCatalog(catalog, filters, clock, facet)) {
    for (const value of facetValues(entry, facet)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** Quante opere su ogni scaffale, senza ricerca né filtri: è il colpo d'occhio. */
export function shelfCounts(catalog: LibraryCatalogEntry[], clock: CatalogClock): Record<LibraryShelf, number> {
  return Object.fromEntries(LIBRARY_SHELVES.map((shelf) =>
    [shelf, catalog.filter((entry) => onShelf(entry, shelf, clock)).length])) as Record<LibraryShelf, number>;
}

/** Quante opere non archiviate in ogni raccolta. */
export function collectionCounts(catalog: LibraryCatalogEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of catalog) {
    if (entry.source.status === 'archived') continue;
    for (const collection of entry.collections) counts.set(collection.id, (counts.get(collection.id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Mette in ordine il catalogo già filtrato: titolo e autore in ordine
 * alfabetico, anno dal più antico, aggiunte e aperte dalle più recenti.
 */
export function orderLibraryCatalog(
  catalog: LibraryCatalogEntry[],
  sort: LibrarySort,
  openedAt: Readonly<Record<string, string>> = {},
): LibraryCatalogEntry[] {
  const byText = (a: string, b: string) => a.localeCompare(b);
  const added = (a: LibraryCatalogEntry, b: LibraryCatalogEntry) =>
    timestampOf(b.source.createdAt) - timestampOf(a.source.createdAt);
  const compare: Record<LibrarySort, (a: LibraryCatalogEntry, b: LibraryCatalogEntry) => number> = {
    title: (a, b) => byText(a.source.title, b.source.title),
    creator: (a, b) => missingLast(a.fields.creator || null, b.fields.creator || null, byText),
    year: (a, b) => missingLast(firstYear(a.fields.date), firstYear(b.fields.date), (x, y) => x - y),
    added,
    opened: (a, b) => missingLast(openedAt[a.source.id] ?? null, openedAt[b.source.id] ?? null,
      (x, y) => timestampOf(y) - timestampOf(x)) || added(a, b),
  };
  return [...catalog].sort(compare[sort]);
}
