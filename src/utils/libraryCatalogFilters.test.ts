import { describe, expect, it } from 'vitest';
import {
  EMPTY_LIBRARY_FILTERS,
  filterLibraryCatalog,
  hasActiveLibraryFilters,
  libraryLanguageOptions,
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
    sizes: [{ sizeTag: '2000', pages: 100, bytes: 0, missing: 0 }],
    principalSize: '2000',
    workspaces: [],
    providerKey: 'vatican',
    original: {},
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
