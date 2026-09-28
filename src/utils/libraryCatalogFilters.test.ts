import { describe, expect, it } from 'vitest';
import {
  EMPTY_LIBRARY_FILTERS,
  collectionCounts,
  facetCounts,
  filterLibraryCatalog,
  hasActiveLibraryFilters,
  orderLibraryCatalog,
  parseLibraryFilters,
  shelfCounts,
  type CatalogClock,
  type LibraryFilters,
} from './libraryCatalogFilters';
import { EMPTY_SOURCE_FIELDS, type LibraryCatalogEntry } from '../types';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const CLOCK: CatalogClock = { now: NOW, openedAt: {} };

function entry(id: string, overrides: Partial<LibraryCatalogEntry> = {}): LibraryCatalogEntry {
  return {
    source: {
      id,
      title: `Opera ${id}`,
      kind: 'print',
      primaryLanguage: 'it',
      externalRef: null,
      status: 'active',
      archivedAt: null,
      createdAt: '2026-01-01 10:00:00',
    },
    versionId: `v-${id}`,
    manifestUrl: `https://example.org/${id}/manifest.json`,
    thumbnailUrl: null,
    fields: EMPTY_SOURCE_FIELDS,
    expectedPages: 100,
    localPages: 100,
    localBytes: 0,
    sizes: [{ sizeTag: '2000', pages: 100, bytes: 0, missing: 0, derived: false }],
    principalSize: '2000',
    workspaces: [],
    providerKey: 'gallica',
    original: {},
    collections: [],
    stage: 'none',
    ...overrides,
  };
}

const withFields = (fields: Partial<LibraryCatalogEntry['fields']>) => ({ ...EMPTY_SOURCE_FIELDS, ...fields });
const ids = (entries: LibraryCatalogEntry[]) => entries.map((item) => item.source.id);
const filters = (overrides: Partial<LibraryFilters>): LibraryFilters => ({ ...EMPTY_LIBRARY_FILTERS, ...overrides });

describe('scaffali', () => {
  const archived = entry('archiviata', { source: { ...entry('archiviata').source, status: 'archived' } });
  const recent = entry('recente', { source: { ...entry('recente').source, createdAt: '2026-09-20 09:00:00' } });
  const remote = entry('online', { localPages: 0, sizes: [] });
  const transcribing = entry('trascrizione', { stage: 'transcribing' });
  const linked = entry('collegata', { workspaces: [{ workspaceId: 'w1', workspaceName: 'W', isOrigin: true }] });
  const catalog = [archived, recent, remote, transcribing, linked];

  it('tiene le archiviate solo nel loro scaffale', () => {
    expect(ids(filterLibraryCatalog(catalog, filters({}), CLOCK))).not.toContain('archiviata');
    expect(ids(filterLibraryCatalog(catalog, filters({ shelf: 'archived' }), CLOCK))).toEqual(['archiviata']);
  });

  it('recenti vuol dire aggiunte o aperte negli ultimi trenta giorni', () => {
    const opened = { ...CLOCK, openedAt: { collegata: '2026-09-24T08:00:00Z' } };
    expect(ids(filterLibraryCatalog(catalog, filters({ shelf: 'recent' }), opened))).toEqual(['recente', 'collegata']);
  });

  it('da scaricare, in trascrizione e non collegate', () => {
    expect(ids(filterLibraryCatalog(catalog, filters({ shelf: 'toDownload' }), CLOCK))).toEqual(['online']);
    expect(ids(filterLibraryCatalog(catalog, filters({ shelf: 'transcribing' }), CLOCK))).toEqual(['trascrizione']);
    expect(ids(filterLibraryCatalog(catalog, filters({ shelf: 'unlinked' }), CLOCK))).not.toContain('collegata');
  });

  it('conta le opere di ogni scaffale', () => {
    const counts = shelfCounts(catalog, CLOCK);
    expect(counts.all).toBe(4);
    expect(counts.archived).toBe(1);
    expect(counts.toDownload).toBe(1);
  });

  it('conta le opere non archiviate di ogni raccolta', () => {
    const inCollection = { collections: [{ id: 'c1', name: 'Rinascimento' }] };
    const counts = collectionCounts([entry('a', inCollection), entry('b', inCollection),
      entry('c', { ...inCollection, source: { ...entry('c').source, status: 'archived' } })]);
    expect(counts.get('c1')).toBe(2);
  });
});

describe('ricerca e filtri rapidi', () => {
  const rabelais = entry('rabelais', { fields: withFields({ creator: 'Rabelais', date: '1542', publisher: 'François Juste', origin_place: 'Lyon' }) });
  const dante = entry('dante', { source: { ...entry('dante').source, kind: 'manuscript', primaryLanguage: 'la' }, fields: withFields({ creator: 'Dante', date: 'ca. 1390' }) });
  const catalog = [rabelais, dante];

  it('la ricerca guarda tutti i dati, compresi tipografo e luogo', () => {
    expect(ids(filterLibraryCatalog(catalog, filters({ query: 'juste' }), CLOCK))).toEqual(['rabelais']);
    expect(ids(filterLibraryCatalog(catalog, filters({ query: 'lyon' }), CLOCK))).toEqual(['rabelais']);
  });

  it('filtra per secolo ricavato dalla data', () => {
    expect(ids(filterLibraryCatalog(catalog, filters({ century: '16' }), CLOCK))).toEqual(['rabelais']);
    expect(ids(filterLibraryCatalog(catalog, filters({ century: '14' }), CLOCK))).toEqual(['dante']);
  });

  it('conta i valori di un filtro senza che la scelta fatta azzeri gli altri', () => {
    const counts = facetCounts(catalog, filters({ kind: 'print' }), CLOCK, 'kind');
    expect(counts.get('print')).toBe(1);
    expect(counts.get('manuscript')).toBe(1);
    expect(facetCounts(catalog, filters({ kind: 'print' }), CLOCK, 'language').get('la')).toBeUndefined();
  });

  it('dice quando un filtro restringe l\'elenco, non per lo scaffale scelto', () => {
    expect(hasActiveLibraryFilters(filters({ shelf: 'recent' }))).toBe(false);
    expect(hasActiveLibraryFilters(filters({ century: '16' }))).toBe(true);
  });
});

describe('ordine', () => {
  const catalog = [
    entry('b', { source: { ...entry('b').source, title: 'Vita nuova', createdAt: '2026-01-02 10:00:00' }, fields: withFields({ creator: 'Dante', date: '1576' }) }),
    entry('a', { source: { ...entry('a').source, title: 'Convivio', createdAt: '2026-01-03 10:00:00' }, fields: withFields({ creator: 'Anonimo', date: '1490' }) }),
    entry('c', { source: { ...entry('c').source, title: 'Rime', createdAt: '2026-01-01 10:00:00' } }),
  ];

  it('per titolo, autore e anno, con i dati mancanti in fondo', () => {
    expect(ids(orderLibraryCatalog(catalog, 'title'))).toEqual(['a', 'c', 'b']);
    expect(ids(orderLibraryCatalog(catalog, 'creator'))).toEqual(['a', 'b', 'c']);
    expect(ids(orderLibraryCatalog(catalog, 'year'))).toEqual(['a', 'b', 'c']);
  });

  it('aggiunte e aperte di recente dalle più recenti', () => {
    expect(ids(orderLibraryCatalog(catalog, 'added'))).toEqual(['a', 'b', 'c']);
    expect(ids(orderLibraryCatalog(catalog, 'opened', { c: '2026-09-01T00:00:00Z' }))).toEqual(['c', 'a', 'b']);
  });
});

describe('parseLibraryFilters', () => {
  it('rilegge una vista salvata e riporta al neutro quello che non riconosce', () => {
    const parsed = parseLibraryFilters(JSON.stringify({ shelf: 'recent', century: '16', sort: 'nonsense', includeArchived: true }));
    expect(parsed).toEqual(filters({ shelf: 'recent', century: '16' }));
  });

  it('non si fida di un testo che non è JSON', () => {
    expect(parseLibraryFilters('{')).toBeNull();
  });
});
