import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../embeddingService', () => ({
  fetchEmbeddings: vi.fn(),
  estimateTokenCount: vi.fn((t: string) => t.split(/\s+/).length),
  estimateEmbeddingCostUsd: vi.fn(() => 0.001),
}));

import { invoke } from '@tauri-apps/api/core';
import { fetchEmbeddings } from '../embeddingService';
import {
  deletePhraseMemoryEntry,
  listPhraseMemoryEntries,
  splitPhrases,
  runEmbeddingJob,
  searchPhraseMemory,
  searchPhraseMemoryBatch,
  saveSelectedPhrases,
  savePhrasePairs,
  updatePhraseMemoryEntry,
} from '../phraseMemoryService';

const mockInvoke = vi.mocked(invoke);
const mockFetchEmbeddings = vi.mocked(fetchEmbeddings);

const SAMPLE = 'Il gatto dorme sul tetto. La luna brilla nel cielo; le stelle sono molte: sono infinite.';

describe('splitPhrases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('none restituisce testo intero come unica frase', async () => {
    expect(await splitPhrases(SAMPLE, 'none')).toEqual([SAMPLE]);
  });

  it('regex split su . ; :', async () => {
    const result = await splitPhrases(SAMPLE, 'regex');
    expect(result.length).toBeGreaterThanOrEqual(4);
    result.forEach((p) => {
      expect(p.trim().length).toBeGreaterThan(0);
      expect(SAMPLE).toContain(p.trim());
    });
  });

  it('regex scarta frasi < 3 caratteri', async () => {
    const result = await splitPhrases('A. BB. Una frase lunga abbastanza.', 'regex');
    result.forEach((p) => expect(p.trim().length).toBeGreaterThanOrEqual(3));
  });

  it('llm chiama invoke split_phrases_llm', async () => {
    const phrases = ['Il gatto dorme sul tetto', 'La luna brilla nel cielo'];
    mockInvoke.mockResolvedValueOnce(phrases);
    const result = await splitPhrases(SAMPLE, 'llm');
    expect(mockInvoke).toHaveBeenCalledWith('split_phrases_llm', { sourceText: SAMPLE });
    expect(result).toEqual(phrases);
  });

  it('llm fallback a regex se invoke fallisce', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('timeout'));
    const result = await splitPhrases(SAMPLE, 'llm');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('runEmbeddingJob', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chiama vec_upsert_source_phrase per ogni frase trovata', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);
    mockInvoke.mockResolvedValue(undefined);

    await runEmbeddingJob({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      embeddingModel: 'text-embedding-3-small',
      splitter: 'regex',
      chunks: [{ id: 'c1', text: 'Ciao. Mondo.' }],
      onProgress: vi.fn(),
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'vec_upsert_source_phrase',
      expect.objectContaining({ projectId: 'proj-1' }),
    );
  });

  it('chiama onProgress con valori aggiornati', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    mockInvoke.mockResolvedValue(undefined);
    const onProgress = vi.fn();

    await runEmbeddingJob({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      embeddingModel: 'text-embedding-3-small',
      splitter: 'none',
      chunks: [{ id: 'c1', text: 'Una frase.' }],
      onProgress,
    });

    expect(onProgress).toHaveBeenCalled();
  });
});

describe('searchPhraseMemory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('restituisce PhraseMatch[] mappato da snake_case', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockInvoke.mockResolvedValueOnce([
      { phrase_memory_id: 'pm-1', source_phrase: 'ciao', target_phrase: 'hello', distance: 0.05 },
    ]);

    const results = await searchPhraseMemory({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      queryText: 'ciao mondo',
      threshold: 0.3,
      maxResults: 5,
    });

    expect(results[0]).toMatchObject({ sourcePhrase: 'ciao', targetPhrase: 'hello' });
  });

  it('restituisce array vuoto se invoke restituisce []', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    mockInvoke.mockResolvedValueOnce([]);

    const results = await searchPhraseMemory({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      queryText: 'testo',
      threshold: 0.3,
      maxResults: 5,
    });

    expect(results).toEqual([]);
  });
});

describe('searchPhraseMemoryBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chiama fetchEmbeddings una sola volta per tutti i chunk', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);
    mockInvoke.mockResolvedValue([
      { phrase_memory_id: 'pm-1', source_phrase: 'ciao', target_phrase: 'hello', distance: 0.05 },
    ]);

    const results = await searchPhraseMemoryBatch({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      chunks: [
        { id: 'c1', text: 'ciao' },
        { id: 'c2', text: 'mondo' },
      ],
      threshold: 0.3,
      maxResults: 5,
    });

    expect(mockFetchEmbeddings).toHaveBeenCalledTimes(1);
    expect(mockFetchEmbeddings).toHaveBeenCalledWith(['ciao', 'mondo'], 'text-embedding-3-small');
    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(results.get('c1')?.[0]).toMatchObject({ sourcePhrase: 'ciao', targetPhrase: 'hello' });
  });
});

describe('phrase memory entry management', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mappa le entry salvate da snake_case a camelCase', async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: 'pm-1',
        workspace_id: 'ws-1',
        source_phrase: 'ciao',
        target_phrase: 'hello',
        source_language: 'Italian',
        target_language: 'English',
        author: null,
        work: null,
        domain: null,
        tags: null,
        notes: null,
        chunk_id: 'c1',
        project_id: 'p1',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);

    const result = await listPhraseMemoryEntries('ws-1');

    expect(mockInvoke).toHaveBeenCalledWith('vec_list_phrase_memory', { workspaceId: 'ws-1' });
    expect(result[0]).toMatchObject({
      id: 'pm-1',
      workspaceId: 'ws-1',
      sourcePhrase: 'ciao',
      targetPhrase: 'hello',
    });
  });

  it('elimina una entry workspace-scoped', async () => {
    mockInvoke.mockResolvedValueOnce(1);

    await deletePhraseMemoryEntry('ws-1', 'pm-1');

    expect(mockInvoke).toHaveBeenCalledWith('vec_delete_phrase_memory', {
      workspaceId: 'ws-1',
      phraseMemoryId: 'pm-1',
    });
  });

  it('rigenera embedding quando aggiorna una entry', async () => {
    mockFetchEmbeddings.mockResolvedValueOnce([[0.1, 0.2]]);
    mockInvoke.mockResolvedValueOnce(undefined);

    await updatePhraseMemoryEntry({
      workspaceId: 'ws-1',
      phraseMemoryId: 'pm-1',
      embeddingModel: 'text-embedding-3-small',
      sourcePhrase: ' ciao ',
      targetPhrase: ' hello ',
    });

    expect(mockFetchEmbeddings).toHaveBeenCalledWith(['ciao'], 'text-embedding-3-small');
    expect(mockInvoke).toHaveBeenCalledWith('vec_update_phrase_memory', {
      workspaceId: 'ws-1',
      phraseMemoryId: 'pm-1',
      sourcePhrase: 'ciao',
      targetPhrase: 'hello',
      embedding: [0.1, 0.2],
    });
  });
});

describe('saveSelectedPhrases', () => {
  beforeEach(() => vi.clearAllMocks());

  it('salva solo i chunk passati esplicitamente e aggiorna il progress', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    mockInvoke.mockResolvedValue(undefined);
    const onProgress = vi.fn();

    await saveSelectedPhrases({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      embeddingModel: 'text-embedding-3-small',
      splitter: 'regex',
      minPhraseLength: 3,
      sourceLanguage: 'it',
      targetLanguage: 'en',
      chunks: [
        { id: 'c1', sourceText: 'Ciao mondo.', targetText: 'Hello world.' },
        { id: 'c3', sourceText: 'Buona notte.', targetText: 'Good night.' },
      ],
      onProgress,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(mockInvoke).toHaveBeenCalledWith(
      'vec_save_locked_phrases',
      expect.objectContaining({ chunkId: 'c1' }),
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      'vec_save_locked_phrases',
      expect.objectContaining({ chunkId: 'c3' }),
    );
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });
});

describe('savePhrasePairs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chiama vec_save_locked_phrases con workspace e chunk corretti', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    mockInvoke.mockResolvedValueOnce(1);

    await savePhrasePairs({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      chunkId: 'c1',
      embeddingModel: 'text-embedding-3-small',
      splitter: 'regex',
      sourceText: 'Ciao mondo.',
      targetText: 'Hello world.',
      minPhraseLength: 3,
      sourceLanguage: 'it',
      targetLanguage: 'en',
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'vec_save_locked_phrases',
      expect.objectContaining({ workspaceId: 'ws-1', projectId: 'proj-1', chunkId: 'c1' }),
    );
  });
});
