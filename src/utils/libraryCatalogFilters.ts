import {
  summarizeAvailability,
  type SourceAvailability,
} from '../services/vaultService';
import type { LibraryCatalogEntry, SourceKind } from '../types';

/**
 * Come si ordina il catalogo. Il titolo è il criterio di partenza: è il modo in
 * cui si cerca un libro a occhio su uno scaffale.
 */
export const LIBRARY_SORTS = ['title', 'creator', 'added'] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

/** Valore speciale del filtro workspace: le opere che non stanno in nessuno. */
export const NO_WORKSPACE = 'none';

/** Le nature d'origine riconosciute in automatico, nell'ordine in cui si
 *  mostrano nel filtro. Il campo resta semi-libero (ogni biblioteca lo
 *  dichiara a modo suo): questi sono solo i valori che il riconoscimento
 *  automatico sa assegnare oggi, non un enum chiuso a livello di dato. */
export const SOURCE_KINDS: SourceKind[] = ['manuscript', 'print', 'other'];

export interface LibraryFilters {
  query: string;
  kind: SourceKind | '';
  language: string | '';
  providerKey: string | '';
  availability: SourceAvailability | '';
  /** Le archiviate stanno fuori dai risultati finché non si chiede di vederle. */
  includeArchived: boolean;
  collectionId: string | '';
  /**
   * Un identificativo di workspace tiene le opere collegate a quello;
   * `NO_WORKSPACE` tiene quelle che non stanno in nessun workspace.
   */
  workspaceId: string | '';
  sort: LibrarySort;
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = {
  query: '',
  kind: '',
  language: '',
  providerKey: '',
  availability: '',
  includeArchived: false,
  collectionId: '',
  workspaceId: '',
  sort: 'title',
};

export function hasActiveLibraryFilters(filters: LibraryFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.includeArchived ||
    filters.kind !== '' ||
    filters.language !== '' ||
    filters.providerKey !== '' ||
    filters.availability !== '' ||
    filters.collectionId !== '' ||
    filters.workspaceId !== '' ||
    // L'ordinamento non nasconde niente, ma cambia quello che si ha davanti:
    // se non contasse, azzerare i filtri lascerebbe un elenco riordinato senza
    // che si veda più da dove viene.
    filters.sort !== EMPTY_LIBRARY_FILTERS.sort
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
      workspaceId: text(record.workspaceId),
      sort: (LIBRARY_SORTS as readonly string[]).includes(text(record.sort))
        ? (record.sort as LibrarySort)
        : EMPTY_LIBRARY_FILTERS.sort,
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
    if (filters.workspaceId === NO_WORKSPACE && entry.workspaces.length > 0) return false;
    if (
      filters.workspaceId &&
      filters.workspaceId !== NO_WORKSPACE &&
      !entry.workspaces.some((link) => link.workspaceId === filters.workspaceId)
    )
      return false;
    return true;
  });
}

/**
 * Mette in ordine il catalogo già filtrato.
 *
 * Titolo e autore in ordine alfabetico secondo la lingua di chi legge; per data
 * di aggiunta si parte dalle più recenti, che è il motivo per cui si guarda
 * quell'ordine. Le opere senza autore finiscono in fondo invece che in cima:
 * un vuoto non è un nome che viene prima di tutti.
 */
export function orderLibraryCatalog(
  catalog: LibraryCatalogEntry[],
  sort: LibrarySort,
): LibraryCatalogEntry[] {
  const ordered = [...catalog];
  if (sort === 'added') {
    return ordered.sort((a, b) => b.source.createdAt.localeCompare(a.source.createdAt));
  }
  if (sort === 'creator') {
    return ordered.sort((a, b) => {
      if (!a.creator) return b.creator ? 1 : 0;
      if (!b.creator) return -1;
      return a.creator.localeCompare(b.creator);
    });
  }
  return ordered.sort((a, b) => a.source.title.localeCompare(b.source.title));
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
