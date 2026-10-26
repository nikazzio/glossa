/** Un gruppo di un elenco: la chiave è il valore (secolo, autore…), vuota per chi non ce l'ha. */
export interface CatalogGroup<T> {
  key: string;
  entries: T[];
}

/**
 * Divide un elenco già ordinato in gruppi, tenendo l'ordine dentro ogni gruppo.
 * Una voce con più chiavi compare sotto ognuna. Il gruppo di chi non ha il
 * valore va in fondo; gli altri si ordinano con `compareKeys`.
 */
export function groupEntries<T>(
  entries: T[],
  keysOf: (entry: T) => string[],
  compareKeys: (a: string, b: string) => number,
): CatalogGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    for (const key of keysOf(entry)) groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.entries()]
    .map(([key, grouped]) => ({ key, entries: grouped }))
    .sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : compareKeys(a.key, b.key)));
}
