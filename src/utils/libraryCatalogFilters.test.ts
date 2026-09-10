import { describe, expect, it } from 'vitest';
import {
  EMPTY_LIBRARY_FILTERS,
  filterLibraryCatalog,
  hasActiveLibraryFilters,
  libraryLanguageOptions,
  NO_WORKSPACE,
  orderLibraryCatalog,
  parseLibraryFilters,
} from './libraryCatalogFilters';
import type { LibraryCatalogEntry } from '../types';

function entry(
  overrides: Partial<LibraryCatalogEntry> = {},
): LibraryCatalogEntry {
  return {
    source: {
      id: 'src-1',
      title: 'Commedia',
      kind: 'manuscript',
      primaryLanguage: 'it',
      externalRef: null,
      status: 'active' as const,
      archivedAt: null,
      createdAt: '2026-01-01',
    },
    versionId: 'sver-1',
    manifestUrl: 'https://example.org/manifest.json',
    thumbnailUrl: null,
    creator: 'Dante Alighieri',
    date: null,
    expectedPages: 100,
    localPages: 100,
    localBytes: 0,
    sizes: [{ sizeTag: '2000', pages: 100, bytes: 0, missing: 0, derived: false }],
    principalSize: '2000',
    workspaces: [],
    providerKey: 'vatican',
    original: {},
    collections: [],
    ...overrides,
  };
}

describe('filterLibraryCatalog', () => {
  it('senza filtri restituisce tutto il catalogo', () => {
    const catalog = [
      entry(),
      entry({ source: { ...entry().source, id: 'src-2' } }),
    ];
    expect(filterLibraryCatalog(catalog, EMPTY_LIBRARY_FILTERS)).toHaveLength(
      2,
    );
  });

  it('la ricerca testuale guarda titolo e autore, senza distinguere maiuscole', () => {
    const catalog = [
      entry({ source: { ...entry().source, title: 'Commedia' } }),
    ];
    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        query: 'commedia',
      }),
    ).toHaveLength(1);
    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        query: 'dante',
      }),
    ).toHaveLength(1);
    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        query: 'petrarca',
      }),
    ).toHaveLength(0);
  });

  it('filtra per tipo, lingua e biblioteca sorgente', () => {
    const catalog = [entry()];
    expect(
      filterLibraryCatalog(catalog, { ...EMPTY_LIBRARY_FILTERS, kind: 'pdf' }),
    ).toHaveLength(0);
    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        language: 'fr',
      }),
    ).toHaveLength(0);
    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        providerKey: 'gallica',
      }),
    ).toHaveLength(0);
    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        providerKey: 'vatican',
      }),
    ).toHaveLength(1);
  });

  it('filtra per disponibilità calcolata dal deposito, non da un campo salvato', () => {
    const complete = entry({ localPages: 100, expectedPages: 100 });
    const partial = entry({ localPages: 40, expectedPages: 100 });
    const catalogued = entry({ localPages: 0, expectedPages: 100 });
    const catalog = [complete, partial, catalogued];

    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        availability: 'complete',
      }),
    ).toHaveLength(1);
    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        availability: 'partial',
      }),
    ).toHaveLength(1);
    expect(
      filterLibraryCatalog(catalog, {
        ...EMPTY_LIBRARY_FILTERS,
        availability: 'catalogued',
      }),
    ).toHaveLength(1);
  });
});

describe('hasActiveLibraryFilters', () => {
  it('è falso quando nessun filtro è impostato', () => {
    expect(hasActiveLibraryFilters(EMPTY_LIBRARY_FILTERS)).toBe(false);
  });

  it('è vero appena un filtro qualsiasi ha un valore', () => {
    expect(
      hasActiveLibraryFilters({ ...EMPTY_LIBRARY_FILTERS, query: 'dante' }),
    ).toBe(true);
    expect(
      hasActiveLibraryFilters({ ...EMPTY_LIBRARY_FILTERS, kind: 'pdf' }),
    ).toBe(true);
  });
});

describe('opere archiviate', () => {
  const archiviata = entry({
    source: {
      ...entry().source,
      id: 'src-arch',
      title: 'Trattato archiviato',
      status: 'archived',
      archivedAt: '2026-08-30',
    },
  });

  it('restano fuori dai risultati finché non si chiede di vederle', () => {
    const result = filterLibraryCatalog([entry(), archiviata], EMPTY_LIBRARY_FILTERS);
    expect(result.map((item) => item.source.id)).toEqual(['src-1']);
  });

  it('rientrano quando si chiede di vederle, insieme alle attive', () => {
    const result = filterLibraryCatalog([entry(), archiviata], {
      ...EMPTY_LIBRARY_FILTERS,
      includeArchived: true,
    });
    expect(result.map((item) => item.source.id)).toEqual(['src-1', 'src-arch']);
  });

  it('restano soggette agli altri filtri anche quando sono visibili', () => {
    const result = filterLibraryCatalog([entry(), archiviata], {
      ...EMPTY_LIBRARY_FILTERS,
      includeArchived: true,
      query: 'archiviato',
    });
    expect(result.map((item) => item.source.id)).toEqual(['src-arch']);
  });

  it('vedere le archiviate conta come filtro attivo, così si può azzerare', () => {
    expect(
      hasActiveLibraryFilters({ ...EMPTY_LIBRARY_FILTERS, includeArchived: true }),
    ).toBe(true);
  });
});

describe('collezioni e viste salvate', () => {
  it('il filtro per collezione tiene solo le opere che ci stanno dentro', () => {
    const inCollection = entry({
      source: { ...entry().source, id: 'src-coll' },
      collections: [{ id: 'coll-1', name: 'Codici' }],
    });
    const result = filterLibraryCatalog([entry(), inCollection], {
      ...EMPTY_LIBRARY_FILTERS,
      collectionId: 'coll-1',
    });
    expect(result.map((item) => item.source.id)).toEqual(['src-coll']);
  });

  it('una vista salvata con filtri sconosciuti non rompe niente: torna al valore neutro', () => {
    expect(parseLibraryFilters('{"kind":"sconosciuto","query":"dante"}')).toEqual({
      ...EMPTY_LIBRARY_FILTERS,
      query: 'dante',
    });
  });

  it('una vista salvata illeggibile non produce filtri', () => {
    expect(parseLibraryFilters('non è json')).toBeNull();
  });
});

describe('workspace e ordinamento', () => {
  const nelWorkspace = entry({
    source: { ...entry().source, id: 'src-ws' },
    workspaces: [{ workspaceId: 'ws-1', workspaceName: 'Scherma', isOrigin: false }],
  });

  it('filtra le opere collegate a un workspace', () => {
    const result = filterLibraryCatalog([entry(), nelWorkspace], {
      ...EMPTY_LIBRARY_FILTERS,
      workspaceId: 'ws-1',
    });
    expect(result.map((item) => item.source.id)).toEqual(['src-ws']);
  });

  it('sa anche mostrare solo le opere che non stanno in nessun workspace', () => {
    const result = filterLibraryCatalog([entry(), nelWorkspace], {
      ...EMPTY_LIBRARY_FILTERS,
      workspaceId: NO_WORKSPACE,
    });
    expect(result.map((item) => item.source.id)).toEqual(['src-1']);
  });

  const catalogoDaOrdinare = [
    entry({
      source: { ...entry().source, id: 'b', title: 'Vita nuova', createdAt: '2026-01-02' },
      creator: 'Dante Alighieri',
    }),
    entry({
      source: { ...entry().source, id: 'a', title: 'Convivio', createdAt: '2026-01-03' },
      creator: 'Anonimo',
    }),
    entry({
      source: { ...entry().source, id: 'c', title: 'Rime', createdAt: '2026-01-01' },
      creator: null,
    }),
  ];

  it('ordina per titolo', () => {
    expect(orderLibraryCatalog(catalogoDaOrdinare, 'title').map((item) => item.source.title)).toEqual(
      ['Convivio', 'Rime', 'Vita nuova'],
    );
  });

  it('ordina per autore, con le opere senza autore in fondo', () => {
    expect(orderLibraryCatalog(catalogoDaOrdinare, 'creator').map((item) => item.creator)).toEqual([
      'Anonimo',
      'Dante Alighieri',
      null,
    ]);
  });

  it('per data di aggiunta parte dalle più recenti', () => {
    expect(orderLibraryCatalog(catalogoDaOrdinare, 'added').map((item) => item.source.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('ordinare non tocca il catalogo di partenza', () => {
    const originale = [...catalogoDaOrdinare];
    orderLibraryCatalog(catalogoDaOrdinare, 'added');
    expect(catalogoDaOrdinare).toEqual(originale);
  });

  it('una vista salvata con un ordine sconosciuto torna al titolo', () => {
    expect(parseLibraryFilters('{"sort":"colore"}')).toEqual(EMPTY_LIBRARY_FILTERS);
  });
});

describe('opzioni derivate dal catalogo', () => {
  it('elenca solo le lingue davvero presenti, ordinate e senza doppioni', () => {
    const catalog = [
      entry({ source: { ...entry().source, primaryLanguage: 'it' } }),
      entry({ source: { ...entry().source, primaryLanguage: 'fr' } }),
      entry({ source: { ...entry().source, primaryLanguage: 'it' } }),
      entry({ source: { ...entry().source, primaryLanguage: null } }),
    ];
    expect(libraryLanguageOptions(catalog)).toEqual(['fr', 'it']);
  });
});
