import type { PhraseMemoryEntry } from '../services/phraseMemoryService';

export function makeMemoryEntry(overrides: Partial<PhraseMemoryEntry> = {}): PhraseMemoryEntry {
  return {
    id: 'pm-1', unitId: 'unit-1', sourceRevisionId: 'source-rev-1', targetRevisionId: 'target-rev-1',
    workspaceId: 'ws-1', sourcePhrase: 'Salve', targetPhrase: 'Hello', confidence: 0.9,
    sourceLanguage: 'la', targetLanguage: 'en', sourceLanguageVariety: null, targetLanguageVariety: null, author: null, work: null, domain: null, tags: [], notes: null,
    chunkId: 'c1', projectId: 'p1', sourceId: null, sourceVersionId: null, provenance: {},
    embeddings: [{ provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536, profile: 'source-verbatim-v1' }],
    createdAt: '2026-10-03T10:00:00Z', ...overrides,
  };
}
