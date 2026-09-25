import type { LibraryCatalogEntry } from '../types';
import { centuryOfEntry } from './libraryCatalogFilters';

/** Come si raggruppa l'elenco della Biblioteca. */
export const LIBRARY_GROUPINGS = ['none', 'century', 'creator', 'provider', 'collection'] as const;
export type LibraryGrouping = (typeof LIBRARY_GROUPINGS)[number];

/** Un gruppo dell'elenco: la chiave è il valore (secolo, autore…), vuota per chi non ce l'ha. */
export interface LibraryGroup {
  key: string;
  entries: LibraryCatalogEntry[];
}

function keysOf(entry: LibraryCatalogEntry, by: LibraryGrouping): string[] {
  switch (by) {
    case 'century': return [centuryOfEntry(entry)];
    case 'creator': return [entry.fields.creator ?? ''];
    case 'provider': return [entry.providerKey ?? ''];
    case 'collection': return entry.collections.length > 0 ? entry.collections.map((collection) => collection.id) : [''];
    default: return [''];
  }
}

/**
 * Divide l'elenco già ordinato in gruppi, tenendo l'ordine dentro ogni gruppo.
 * Un'opera in più raccolte compare sotto ognuna. Il gruppo di chi non ha il
 * valore va in fondo; gli altri si ordinano con `compareKeys`.
 */
export function groupCatalog(
  entries: LibraryCatalogEntry[],
  by: LibraryGrouping,
  compareKeys: (a: string, b: string) => number,
): LibraryGroup[] {
  if (by === 'none') return [{ key: '', entries }];
  const groups = new Map<string, LibraryCatalogEntry[]>();
  for (const entry of entries) {
    for (const key of keysOf(entry, by)) groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()]
    .map(([key, grouped]) => ({ key, entries: grouped }))
    .sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : compareKeys(a.key, b.key)));
}
