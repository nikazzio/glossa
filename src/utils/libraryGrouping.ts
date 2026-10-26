import type { LibraryCatalogEntry } from '../types';
import { centuryOfEntry } from './libraryCatalogFilters';
import { groupEntries, type CatalogGroup } from './catalogGrouping';

/** Come si raggruppa l'elenco della Biblioteca. */
export const LIBRARY_GROUPINGS = ['none', 'century', 'creator', 'provider', 'collection'] as const;
export type LibraryGrouping = (typeof LIBRARY_GROUPINGS)[number];

export type LibraryGroup = CatalogGroup<LibraryCatalogEntry>;

function keysOf(entry: LibraryCatalogEntry, by: LibraryGrouping): string[] {
  switch (by) {
    case 'century': return [centuryOfEntry(entry)];
    case 'creator': return [entry.fields.creator ?? ''];
    case 'provider': return [entry.providerKey ?? ''];
    case 'collection': return entry.collections.length > 0 ? entry.collections.map((collection) => collection.id) : [''];
    default: return [''];
  }
}

/** L'elenco della Biblioteca diviso nei gruppi scelti; un'opera in più raccolte compare sotto ognuna. */
export function groupCatalog(
  entries: LibraryCatalogEntry[],
  by: LibraryGrouping,
  compareKeys: (a: string, b: string) => number,
): LibraryGroup[] {
  if (by === 'none') return [{ key: '', entries }];
  return groupEntries(entries, (entry) => keysOf(entry, by), compareKeys);
}
