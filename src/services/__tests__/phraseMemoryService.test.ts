import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../stores/uiStore', () => ({
  useUiStore: { getState: () => ({ ollamaBaseUrl: 'http://localhost:11434' }) },
}));
vi.mock('../embeddingService', () => ({
  fetchEmbeddings: vi.fn(),
}));
vi.mock('../../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { invoke } from '@tauri-apps/api/core';
import { fetchEmbeddings } from '../embeddingService';
import {
  deletePhraseMemoryEntry,
  extractPhraseMemoryPairs,
  listPhraseMemoryEntries,
  searchPhraseMemory,
  searchPhraseMemoryBatch,
  saveSelectedPhrases,
  savePhrasePairs,
  updatePhraseMemoryEntry,
} from '../phraseMemoryService';

const mockInvoke = vi.mocked(invoke);
const mockFetchEmbeddings = vi.mocked(fetchEmbeddings);

describe('extractPhraseMemoryPairs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only verbatim aligned pairs from extractor JSON', async () => {
    mockInvoke.mockResolvedValueOnce({
      pairs: [
        { sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', confidence: 0.92 },
        { sourcePhrase: 'invented', targetPhrase: 'Hello world', confidence: 1 },
        { sourcePhrase: 'Ciao mondo', targetPhrase: 'invented', confidence: 1 },
      ],
    });

    const result = await extractPhraseMemoryPairs({
      provider: 'openai',
      model: 'gpt-5-nano',
      prompt: 'Extract',
      sourceText: 'Ciao mondo. Buona notte.',
      targetText: 'Hello world. Good night.',
      sourceLanguage: 'Italian',
      targetLanguage: 'English',
    });

    expect(mockInvoke).toHaveBeenCalledWith('extract_phrase_memory_pairs', expect.objectContaining({
      provider: 'openai',
      model: 'gpt-5-nano',
      prompt: 'Extract',
      sourceText: 'Ciao mondo. Buona notte.',
      targetText: 'Hello world. Good night.',
    }));
    expect(result).toEqual([
      { sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', confidence: 0.92 },
    ]);
  });

  it('propagates extractor errors without fallback', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('invalid json'));

    await expect(extractPhraseMemoryPairs({
      provider: 'openai',
      model: 'gpt-5-nano',
      prompt: 'Extract',
      sourceText: 'Ciao.',
      targetText: 'Hello.',
      sourceLanguage: 'Italian',
      targetLanguage: 'English',
    })).rejects.toThrow('invalid json');
  });
});

describe('searchPhraseMemory', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps snake_case search results including confidence', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2, 0.3]]);
    mockInvoke.mockResolvedValueOnce([
      {
        phrase_memory_id: 'pm-1',
        source_phrase: 'ciao',
        target_phrase: 'hello',
        distance: 0.05,
        confidence: 0.8,
      },
    ]);

    const results = await searchPhraseMemory({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      queryText: 'ciao mondo',
      threshold: 0.3,
      maxResults: 5,
    });

    expect(results[0]).toMatchObject({
      sourcePhrase: 'ciao',
      targetPhrase: 'hello',
      confidence: 0.8,
    });
  });

  it('uses the source query text for search embeddings', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    mockInvoke.mockResolvedValueOnce([]);

    await searchPhraseMemory({
      workspaceId: 'ws-1',
      embeddingModel: 'text-embedding-3-small',
      queryText: 'source only',
      threshold: 0.3,
      maxResults: 5,
    });

    expect(mockFetchEmbeddings).toHaveBeenCalledWith(['source only'], 'text-embedding-3-small');
  });
});

describe('searchPhraseMemoryBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('embeds source chunk text once for all chunks', async () => {
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]);
    mockInvoke.mockResolvedValue([
      {
        phrase_memory_id: 'pm-1',
        source_phrase: 'ciao',
        target_phrase: 'hello',
        distance: 0.05,
        confidence: 0.9,
      },
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
    expect(results.get('c1')?.[0]).toMatchObject({ sourcePhrase: 'ciao', confidence: 0.9 });
  });
});

describe('phrase memory entry management', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps saved entries from snake_case to camelCase', async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: 'pm-1',
        workspace_id: 'ws-1',
        source_phrase: 'ciao',
        target_phrase: 'hello',
        confidence: 0.88,
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
      confidence: 0.88,
    });
  });

  it('deletes a workspace-scoped entry', async () => {
    mockInvoke.mockResolvedValueOnce(1);

    await deletePhraseMemoryEntry('ws-1', 'pm-1');

    expect(mockInvoke).toHaveBeenCalledWith('vec_delete_phrase_memory', {
      workspaceId: 'ws-1',
      phraseMemoryId: 'pm-1',
    });
  });

  it('regenerates source-only embedding when updating an entry', async () => {
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

  it('extracts and saves only explicitly selected chunks', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        pairs: [{ sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', confidence: 0.91 }],
      })
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce({
        pairs: [{ sourcePhrase: 'Buona notte', targetPhrase: 'Good night', confidence: 0.9 }],
      })
      .mockResolvedValueOnce(1);
    mockFetchEmbeddings.mockResolvedValue([[0.1, 0.2]]);
    const onProgress = vi.fn();

    const savedCount = await saveSelectedPhrases({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      embeddingModel: 'text-embedding-3-small',
      extractorProvider: 'openai',
      extractorModel: 'gpt-5-nano',
      extractorPrompt: 'Extract',
      sourceLanguage: 'it',
      targetLanguage: 'en',
      chunks: [
        { id: 'c1', sourceText: 'Ciao mondo.', targetText: 'Hello world.' },
        { id: 'c3', sourceText: 'Buona notte.', targetText: 'Good night.' },
      ],
      onProgress,
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'vec_save_locked_phrases',
      expect.objectContaining({ workspaceId: 'ws-1', projectId: 'proj-1', chunkId: 'c1' }),
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      'vec_save_locked_phrases',
      expect.objectContaining({ workspaceId: 'ws-1', projectId: 'proj-1', chunkId: 'c3' }),
    );
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
    expect(savedCount).toBe(2);
  });
});

describe('savePhrasePairs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves extracted verbatim pairs with source embeddings and confidence', async () => {
    mockInvoke
      .mockResolvedValueOnce({
        pairs: [
          { sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', confidence: 0.93 },
        ],
      })
      .mockResolvedValueOnce(1);
    mockFetchEmbeddings.mockResolvedValueOnce([[0.1, 0.2]]);

    const savedCount = await savePhrasePairs({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      chunkId: 'c1',
      embeddingModel: 'text-embedding-3-small',
      extractorProvider: 'openai',
      extractorModel: 'gpt-5-nano',
      extractorPrompt: 'Extract',
      sourceText: 'Ciao mondo.',
      targetText: 'Hello world.',
      sourceLanguage: 'it',
      targetLanguage: 'en',
    });

    expect(mockFetchEmbeddings).toHaveBeenCalledWith(['Ciao mondo'], 'text-embedding-3-small');
    expect(mockInvoke).toHaveBeenCalledWith('vec_save_locked_phrases', {
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      chunkId: 'c1',
      embeddingModel: 'text-embedding-3-small',
      sourceLanguage: 'it',
      targetLanguage: 'en',
      pairs: [
        {
          sourcePhrase: 'Ciao mondo',
          targetPhrase: 'Hello world',
          confidence: 0.93,
          sourceEmbedding: [0.1, 0.2],
        },
      ],
    });
    expect(savedCount).toBe(1);
  });

  it('does not fallback or save when extractor fails', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('extractor failed'));

    await expect(savePhrasePairs({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      chunkId: 'c1',
      embeddingModel: 'text-embedding-3-small',
      extractorProvider: 'openai',
      extractorModel: 'gpt-5-nano',
      extractorPrompt: 'Extract',
      sourceText: 'Ciao mondo.',
      targetText: 'Hello world.',
      sourceLanguage: 'it',
      targetLanguage: 'en',
    })).rejects.toThrow('extractor failed');

    expect(mockFetchEmbeddings).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalledWith('vec_save_locked_phrases', expect.anything());
  });

  it('skips non-verbatim extracted pairs before embedding', async () => {
    mockInvoke.mockResolvedValueOnce({
      pairs: [{ sourcePhrase: 'not in source', targetPhrase: 'Hello world', confidence: 0.9 }],
    });

    const savedCount = await savePhrasePairs({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      chunkId: 'c1',
      embeddingModel: 'text-embedding-3-small',
      extractorProvider: 'openai',
      extractorModel: 'gpt-5-nano',
      extractorPrompt: 'Extract',
      sourceText: 'Ciao mondo.',
      targetText: 'Hello world.',
      sourceLanguage: 'it',
      targetLanguage: 'en',
    });

    expect(savedCount).toBe(0);
    expect(mockFetchEmbeddings).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalledWith('vec_save_locked_phrases', expect.anything());
  });
});
