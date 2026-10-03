import { describe, expect, it } from 'vitest';
import type { TranslationCatalogEntry } from '../services/translationCatalogService';
import {
  EMPTY_TRANSLATION_FILTERS,
  filterTranslationCatalog,
  groupTranslationCatalog,
  languagePairKey,
  orderTranslationCatalog,
  splitLanguagePair,
  translationFacetCounts,
  translationShelfCounts,
} from './translationCatalogFilters';

const NOW = Date.parse('2026-10-01T12:00:00Z');

function entry(overrides: Partial<TranslationCatalogEntry>): TranslationCatalogEntry {
  return {
    id: 'p',
    name: 'Progetto',
    workspaceId: 'ws-1',
    workspaceName: 'Archivio',
    sourceLanguage: 'Latin',
    targetLanguage: 'Italian',
    updatedAt: '2026-09-30 10:00:00',
    chunkCount: 0,
    translatedChunks: 0,
    verifiedChunks: 0,
    ...overrides,
  };
}

const empty = entry({ id: 'empty', name: 'Vuota' });
const started = entry({ id: 'started', name: 'Avviata', chunkCount: 10, translatedChunks: 4, verifiedChunks: 2 });
const verified = entry({
  id: 'verified', name: 'Chiusa', workspaceId: 'ws-2', targetLanguage: 'English',
  chunkCount: 3, translatedChunks: 3, verifiedChunks: 3, updatedAt: '2026-01-01 10:00:00',
});
const catalog = [empty, started, verified];

describe('translation catalog shelves', () => {
  it('counts every shelf without search or filters', () => {
    expect(translationShelfCounts(catalog, NOW)).toEqual({ all: 3, recent: 2, toStart: 1, inProgress: 1, verified: 1 });
  });

  it('puts a translation with no imported text among those to start', () => {
    const shown = filterTranslationCatalog(catalog, { ...EMPTY_TRANSLATION_FILTERS, shelf: 'toStart' }, NOW);
    expect(shown.map((item) => item.id)).toEqual(['empty']);
  });

  it('calls verified only a translation whose segments are all locked', () => {
    const shown = filterTranslationCatalog(catalog, { ...EMPTY_TRANSLATION_FILTERS, shelf: 'verified' }, NOW);
    expect(shown.map((item) => item.id)).toEqual(['verified']);
  });
});

describe('translation catalog quick filters', () => {
  it('narrows by language pair and searches by name', () => {
    const pair = languagePairKey(verified);
    expect(filterTranslationCatalog(catalog, { ...EMPTY_TRANSLATION_FILTERS, languagePair: pair }, NOW)).toEqual([verified]);
    expect(filterTranslationCatalog(catalog, { ...EMPTY_TRANSLATION_FILTERS, query: 'avv' }, NOW)).toEqual([started]);
  });

  it('counts the values of a filter with the other filters applied', () => {
    const counts = translationFacetCounts(catalog, { ...EMPTY_TRANSLATION_FILTERS, workspaceId: 'ws-1' }, NOW, 'languagePair');
    expect(counts.get(languagePairKey(started))).toBe(2);
    expect(counts.has(languagePairKey(verified))).toBe(false);
  });

  it('splits a language pair key back into its two languages', () => {
    expect(splitLanguagePair(languagePairKey(verified))).toEqual(['Latin', 'English']);
  });
});

describe('translation catalog order and groups', () => {
  it('orders by progress, then by name', () => {
    expect(orderTranslationCatalog(catalog, 'progress').map((item) => item.id)).toEqual(['verified', 'started', 'empty']);
    expect(orderTranslationCatalog(catalog, 'name').map((item) => item.id)).toEqual(['started', 'verified', 'empty']);
  });

  it('groups by workspace keeping the order inside each group', () => {
    const groups = groupTranslationCatalog(catalog, 'workspace', (a, b) => a.localeCompare(b));
    expect(groups.map((group) => [group.key, group.entries.map((item) => item.id)])).toEqual([
      ['ws-1', ['empty', 'started']],
      ['ws-2', ['verified']],
    ]);
  });
});
