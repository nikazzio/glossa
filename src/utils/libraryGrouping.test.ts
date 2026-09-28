import { describe, expect, it } from 'vitest';
import { groupCatalog } from './libraryGrouping';
import { EMPTY_SOURCE_FIELDS, type LibraryCatalogEntry } from '../types';

function entry(id: string, date: string | null, collections: string[] = []): LibraryCatalogEntry {
  return {
    source: { id, title: id, kind: 'print', primaryLanguage: null, externalRef: null, status: 'active', archivedAt: null, createdAt: '2026-01-01 10:00:00' },
    versionId: null, manifestUrl: null, thumbnailUrl: null,
    fields: { ...EMPTY_SOURCE_FIELDS, date },
    expectedPages: null, localPages: 0, localBytes: 0, sizes: [], principalSize: null, workspaces: [],
    providerKey: null, original: {}, collections: collections.map((name) => ({ id: name, name })), stage: 'none',
  };
}

const byNumber = (a: string, b: string) => Number(a) - Number(b);

describe('groupCatalog', () => {
  it('senza raggruppamento è un gruppo solo', () => {
    const entries = [entry('a', '1542')];
    expect(groupCatalog(entries, 'none', byNumber)).toEqual([{ key: '', entries }]);
  });

  it('raggruppa per secolo, con le opere senza data in fondo', () => {
    const groups = groupCatalog([entry('a', '1542'), entry('b', null), entry('c', '1490'), entry('d', '1560')], 'century', byNumber);
    expect(groups.map((group) => [group.key, group.entries.map((item) => item.source.id)]))
      .toEqual([['15', ['c']], ['16', ['a', 'd']], ['', ['b']]]);
  });

  it('un\'opera in due raccolte compare sotto entrambe', () => {
    const groups = groupCatalog([entry('a', null, ['x', 'y']), entry('b', null)], 'collection', (a, b) => a.localeCompare(b));
    expect(groups.map((group) => group.key)).toEqual(['x', 'y', '']);
    expect(groups[0].entries[0].source.id).toBe('a');
    expect(groups[1].entries[0].source.id).toBe('a');
  });
});
