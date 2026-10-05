import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunksStore } from '../stores/chunksStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { makeTranslationChunk } from '../test/chunkFactory';
import { listPhraseMemoryEntries, searchPhraseMemory, searchPhraseMemoryBatch } from '../services/phraseMemoryService';
import { usePhraseMemoryAutoSearch } from './usePhraseMemoryAutoSearch';

vi.mock('../services/phraseMemoryService', () => ({
  searchPhraseMemory: vi.fn(),
  searchPhraseMemoryBatch: vi.fn(),
  listPhraseMemoryEntries: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: { warn: vi.fn() },
}));

const mockSearchPhraseMemory = vi.mocked(searchPhraseMemory);
const mockSearchPhraseMemoryBatch = vi.mocked(searchPhraseMemoryBatch);
const mockListPhraseMemoryEntries = vi.mocked(listPhraseMemoryEntries);

const workspace = {
  id: 'ws-1',
  name: 'Workspace',
  iconKey: 'book' as const,
  embeddingModel: 'text-embedding-3-small' as const,
  memoryExtractorProvider: 'openai' as const,
  memoryExtractorModel: 'gpt-5-nano',
  memoryExtractorPrompt: 'Extract',
  ocrDefaultProvider: '' as const, ocrDefaultModel: '', ocrDefaultPrompt: '', memorySearchAllWorkspaces: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('usePhraseMemoryAutoSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchPhraseMemoryBatch.mockResolvedValue(new Map([
      ['c1', [
        {
          phraseMemoryId: 'pm-1',
          sourcePhrase: 'Ciao',
          targetPhrase: 'Hello',
          distance: 0.1,
          confidence: 0.9, sourceLanguage: 'lat', targetLanguage: 'ita', workspaceId: null, projectId: null, chunkId: null },
      ]],
    ]));
    mockSearchPhraseMemory.mockResolvedValue([
      {
        phraseMemoryId: 'pm-2',
        sourcePhrase: 'Mondo',
        targetPhrase: 'World',
        distance: 0.2,
      confidence: 0.8, sourceLanguage: 'lat', targetLanguage: 'ita', workspaceId: null, projectId: null, chunkId: null },
    ]);
    mockListPhraseMemoryEntries.mockResolvedValue([]);

    useWorkspaceStore.setState({
      activeWorkspace: workspace,
      workspaces: [],
      loading: false,
      isLoaded: true,
    });
    useProjectStore.setState({ currentProjectId: 'proj-1' });
    usePipelineStore.setState((state) => ({
      ...state,
      workLanguages: {
        source: { code: 'ita', variety: null, note: '' },
        target: { code: 'eng', variety: null, note: '' },
      },
      config: {
        ...state.config,
        usePhraseMemory: true,
        autoSearchPhraseMemory: true,
        phraseMemorySimilarityThreshold: 0.75,
        phraseMemoryMaxResults: 5,
      },
    }));
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'c1',
          sourceProcessingText: 'Ciao mondo.',
        }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });
    usePhraseMemoryStore.getState().reset();
  });

  it('runs background search when memory and auto-search are enabled', async () => {
    renderHook(() => usePhraseMemoryAutoSearch());

    await waitFor(() => {
      expect(mockSearchPhraseMemoryBatch).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(usePhraseMemoryStore.getState().searchStatus).toBe('done');
    });

    const entry = usePhraseMemoryStore.getState().matchesByChunk.get('c1');
    expect(entry?.matches).toHaveLength(1);
    expect(entry?.enabledMatchIds.size).toBe(0);
  });

  it('does not auto-search when pipeline auto-search is disabled', () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, autoSearchPhraseMemory: false },
    }));

    renderHook(() => usePhraseMemoryAutoSearch());

    expect(mockSearchPhraseMemoryBatch).not.toHaveBeenCalled();
    expect(usePhraseMemoryStore.getState().searchStatus).toBe('idle');
  });

  it('manual refresh works when auto-search is disabled', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, autoSearchPhraseMemory: false },
    }));
    const { result } = renderHook(() => usePhraseMemoryAutoSearch({ auto: false }));

    await act(async () => {
      await result.current.runSearchForChunk('c1');
    });

    expect(mockListPhraseMemoryEntries).not.toHaveBeenCalled();
    expect(mockSearchPhraseMemory).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      queryText: 'Ciao mondo.',
      threshold: 0.75,
      maxResults: 5,
    }));
    expect(usePhraseMemoryStore.getState().matchesByChunk.get('c1')?.matches.map((match) => match.id)).toEqual([
      'pm-2',
    ]);
  });

  it('does not search when Phrase Memory is disabled', () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, usePhraseMemory: false },
    }));

    renderHook(() => usePhraseMemoryAutoSearch());

    expect(mockSearchPhraseMemoryBatch).not.toHaveBeenCalled();
    expect(usePhraseMemoryStore.getState().searchStatus).toBe('idle');
  });

  it('exposes error status when automatic search fails', async () => {
    mockSearchPhraseMemoryBatch.mockRejectedValueOnce(new Error('search failed'));

    renderHook(() => usePhraseMemoryAutoSearch());

    await waitFor(() => {
      expect(usePhraseMemoryStore.getState().searchStatus).toBe('error');
    });
  });
  it('repeats automatic search after the cross-workspace setting changes', async () => {
    renderHook(() => usePhraseMemoryAutoSearch());
    await waitFor(() => expect(mockSearchPhraseMemoryBatch).toHaveBeenCalledTimes(1));
    act(() => { useWorkspaceStore.setState({ activeWorkspace: { ...workspace, memorySearchAllWorkspaces: true } }); });
    await waitFor(() => expect(mockSearchPhraseMemoryBatch).toHaveBeenLastCalledWith(expect.objectContaining({
      allWorkspaces: true, targetLanguage: 'eng', embeddingModel: workspace.embeddingModel,
    })));
  });
  it('searches with only the target language of the work, never the source language', async () => {
    renderHook(() => usePhraseMemoryAutoSearch());
    await waitFor(() => expect(mockSearchPhraseMemoryBatch).toHaveBeenCalledTimes(1));
    const options = mockSearchPhraseMemoryBatch.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(options.targetLanguage).toBe('eng');
    expect(options).not.toHaveProperty('sourceLanguage');
  });
  it('omits the target language when the work does not specify one', async () => {
    usePipelineStore.setState((state) => ({
      workLanguages: { ...state.workLanguages, target: { code: null, variety: null, note: '' } },
    }));
    renderHook(() => usePhraseMemoryAutoSearch());
    await waitFor(() => expect(mockSearchPhraseMemoryBatch).toHaveBeenCalledTimes(1));
    expect((mockSearchPhraseMemoryBatch.mock.calls[0][0] as unknown as Record<string, unknown>).targetLanguage).toBeUndefined();
  });
  it('removes previous selected references after an scope change with automatic search off', async () => {
    const { result } = renderHook(() => usePhraseMemoryAutoSearch({ auto: false }));
    await act(async () => { await result.current.runSearchForChunk('c1'); });
    act(() => { usePhraseMemoryStore.getState().toggleMatchEnabled('c1', 'pm-2'); });
    expect(usePhraseMemoryStore.getState().matchesByChunk.get('c1')?.enabledMatchIds.has('pm-2')).toBe(true);
    act(() => { useWorkspaceStore.setState({ activeWorkspace: { ...workspace, memorySearchAllWorkspaces: true } }); });
    expect(usePhraseMemoryStore.getState().matchesByChunk.size).toBe(0);
  });
});
