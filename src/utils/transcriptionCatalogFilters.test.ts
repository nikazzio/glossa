import { describe, expect, it } from 'vitest';
import {
  EMPTY_TRANSCRIPTION_FILTERS,
  filterTranscriptionCatalog,
  groupTranscriptionCatalog,
  hasActiveTranscriptionFilters,
  isFullyVerified,
  orderTranscriptionCatalog,
  progressOf,
  transcriptionFacetCounts,
  transcriptionShelfCounts,
} from './transcriptionCatalogFilters';
import type { TranscriptionCatalogEntry } from '../services/transcriptionCatalogService';
import { EMPTY_SOURCE_FIELDS, type LibraryCatalogEntry } from '../types';

const NOW = Date.parse('2026-09-30T12:00:00Z');

function work(id: string, overrides: Partial<LibraryCatalogEntry> = {}): LibraryCatalogEntry {
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
    manifestUrl: null,
    thumbnailUrl: null,
    fields: EMPTY_SOURCE_FIELDS,
    expectedPages: 100,
    localPages: 0,
    localBytes: 0,
    sizes: [],
    principalSize: null,
    workspaces: [],
    providerKey: 'gallica',
    original: {},
    collections: [],
    stage: 'transcribing',
    ...overrides,
  };
}

function entry(id: string, overrides: Partial<TranscriptionCatalogEntry> = {}): TranscriptionCatalogEntry {
  return {
    document: {
      id,
      source_version_id: `v-${id}`,
      workspace_id: 'ws-1',
      title: `Trascrizione ${id}`,
      status: 'active',
      ocr_provider: null,
      ocr_model: null,
      ocr_prompt: null,
    },
    work: work(id),
    pagesWithText: 0,
    verifiedPages: 0,
    createdAt: '2026-01-01 10:00:00',
    lastEditedAt: '2026-01-01 10:00:00',
    ...overrides,
  };
}

const ids = (entries: TranscriptionCatalogEntry[]) => entries.map((item) => item.document.id);

describe('transcription catalog progress', () => {
  it('measures written pages against the pages of the work', () => {
    expect(progressOf(entry('a', { pagesWithText: 25 }))).toBe(0.25);
  });

  it('counts a document without a known total as done once a page is written', () => {
    expect(progressOf(entry('a', { work: null, pagesWithText: 1 }))).toBe(1);
    expect(progressOf(entry('b', { work: null }))).toBe(0);
  });

  it('is verified only when every page of the work is verified', () => {
    expect(isFullyVerified(entry('a', { pagesWithText: 100, verifiedPages: 99 }))).toBe(false);
    expect(isFullyVerified(entry('b', { pagesWithText: 100, verifiedPages: 100 }))).toBe(true);
    expect(isFullyVerified(entry('c', { work: null, pagesWithText: 1, verifiedPages: 1 }))).toBe(true);
  });
});

describe('transcription catalog shelves', () => {
  const catalog = [
    entry('new'),
    entry('going', { pagesWithText: 10, verifiedPages: 2, lastEditedAt: '2026-09-29 09:00:00' }),
    entry('done', { pagesWithText: 100, verifiedPages: 100 }),
    entry('free', { work: null, document: { ...entry('free').document, source_version_id: null } }),
    entry('old', { document: { ...entry('old').document, status: 'archived' } }),
  ];

  it('sorts each transcription onto the shelves that describe it', () => {
    const on = (shelf: typeof EMPTY_TRANSCRIPTION_FILTERS.shelf) =>
      ids(filterTranscriptionCatalog(catalog, { ...EMPTY_TRANSCRIPTION_FILTERS, shelf }, NOW));
    expect(on('all')).toEqual(['new', 'going', 'done', 'free']);
    expect(on('recent')).toEqual(['going']);
    expect(on('toStart')).toEqual(['new', 'free']);
    expect(on('inProgress')).toEqual(['going']);
    expect(on('verified')).toEqual(['done']);
    expect(on('unlinked')).toEqual(['free']);
    expect(on('archived')).toEqual(['old']);
  });

  it('counts the shelves without search or filters', () => {
    expect(transcriptionShelfCounts(catalog, NOW)).toEqual({
      all: 4, recent: 1, toStart: 2, inProgress: 1, verified: 1, unlinked: 1, archived: 1,
    });
  });
});

describe('transcription catalog search and filters', () => {
  const catalog = [
    entry('a', { work: work('a', { fields: { ...EMPTY_SOURCE_FIELDS, creator: 'Marozzo', date: '1536' } }) }),
    entry('b', { document: { ...entry('b').document, workspace_id: 'ws-2' }, work: work('b', { providerKey: 'mdz' }) }),
  ];

  it('finds a transcription by the author of its work', () => {
    expect(ids(filterTranscriptionCatalog(catalog, { ...EMPTY_TRANSCRIPTION_FILTERS, query: 'maroz' }, NOW))).toEqual(['a']);
  });

  it('narrows by workspace and counts the other values', () => {
    const filters = { ...EMPTY_TRANSCRIPTION_FILTERS, workspaceId: 'ws-2' };
    expect(ids(filterTranscriptionCatalog(catalog, filters, NOW))).toEqual(['b']);
    expect(transcriptionFacetCounts(catalog, filters, NOW, 'workspaceId')).toEqual(new Map([['ws-1', 1], ['ws-2', 1]]));
    expect(hasActiveTranscriptionFilters(filters)).toBe(true);
  });

  it('narrows by the century of the work', () => {
    expect(ids(filterTranscriptionCatalog(catalog, { ...EMPTY_TRANSCRIPTION_FILTERS, century: '16' }, NOW))).toEqual(['a']);
  });
});

describe('transcription catalog order and groups', () => {
  it('puts the most advanced transcription first when sorting by progress', () => {
    const catalog = [entry('a', { pagesWithText: 10 }), entry('b', { pagesWithText: 90 })];
    expect(ids(orderTranscriptionCatalog(catalog, 'progress'))).toEqual(['b', 'a']);
  });

  it('puts the last edited transcription first', () => {
    const catalog = [entry('a'), entry('b', { lastEditedAt: '2026-09-01 10:00:00' })];
    expect(ids(orderTranscriptionCatalog(catalog, 'edited'))).toEqual(['b', 'a']);
  });

  it('groups by library with the ones without a work at the end', () => {
    const catalog = [entry('a', { work: null }), entry('b'), entry('c', { work: work('c', { providerKey: 'mdz' }) })];
    const groups = groupTranscriptionCatalog(catalog, 'provider', (x, y) => x.localeCompare(y));
    expect(groups.map((group) => [group.key, ids(group.entries)])).toEqual([
      ['gallica', ['b']], ['mdz', ['c']], ['', ['a']],
    ]);
  });
});
