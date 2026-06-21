import { describe, it, expect } from 'vitest';
import { exportPhraseMemoryToCsv } from '../phraseMemoryService';
import type { PhraseMemoryEntry } from '../phraseMemoryService';

const MOCK_ENTRIES: PhraseMemoryEntry[] = [
  {
    id: '1',
    workspaceId: 'ws1',
    sourcePhrase: 'Hello world',
    targetPhrase: 'Ciao mondo',
    confidence: 0.95,
    sourceLanguage: 'en',
    targetLanguage: 'it',
    author: null,
    work: null,
    domain: 'general',
    tags: null,
    notes: null,
    chunkId: null,
    projectId: null,
    embeddingModel: null,
    createdAt: '2024-01-01T00:00:00Z',
  },
];

describe('exportPhraseMemoryToCsv', () => {
  it('returns CSV string with header row', () => {
    const csv = exportPhraseMemoryToCsv(MOCK_ENTRIES);
    expect(csv).toContain('source_phrase');
    expect(csv).toContain('target_phrase');
  });

  it('includes entry data', () => {
    const csv = exportPhraseMemoryToCsv(MOCK_ENTRIES);
    expect(csv).toContain('Hello world');
    expect(csv).toContain('Ciao mondo');
    expect(csv).toContain('0.95');
  });

  it('returns empty CSV with only headers for empty input', () => {
    const csv = exportPhraseMemoryToCsv([]);
    expect(csv).toContain('source_phrase');
    expect(csv.split('\n').length).toBeLessThanOrEqual(2);
  });
});
