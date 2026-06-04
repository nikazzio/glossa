import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunksStore } from '../stores/chunksStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { makeTranslationChunk } from '../test/chunkFactory';
import { listPresets } from '../services/phraseMemoryPresetService';
import { searchPhraseMemoryBatch } from '../services/phraseMemoryService';
import { usePhraseMemoryAutoSearch } from './usePhraseMemoryAutoSearch';

vi.mock('../services/phraseMemoryPresetService', () => ({
  listPresets: vi.fn(),
}));

vi.mock('../services/phraseMemoryService', () => ({
  searchPhraseMemoryBatch: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: { warn: vi.fn() },
}));

const mockListPresets = vi.mocked(listPresets);
const mockSearchPhraseMemoryBatch = vi.mocked(searchPhraseMemoryBatch);

describe('usePhraseMemoryAutoSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPresets.mockResolvedValue([
      {
        id: 'preset-1',
        name: 'Default',
        isBuiltin: true,
        config: {
          splitter: 'regex',
          similarityThreshold: 0.75,
          maxResults: 5,
          minPhraseLength: 3,
        },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    mockSearchPhraseMemoryBatch.mockResolvedValue(new Map([
      ['c1', [
        {
          phraseMemoryId: 'pm-1',
          sourcePhrase: 'Ciao',
          targetPhrase: 'Hello',
          distance: 0.1,
        },
      ]],
    ]));

    useWorkspaceStore.setState({
      activeWorkspace: {
        id: 'ws-1',
        name: 'Workspace',
        embeddingModel: 'text-embedding-3-small',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      workspaces: [],
      loading: false,
      isLoaded: true,
    });
    useProjectStore.setState({ currentProjectId: 'proj-1' });
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        usePhraseMemory: true,
        phraseMemoryPresetId: 'preset-1',
        phraseMemoryOverrides: null,
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

  it('cerca in background, mostra stato done e lascia i match non selezionati', async () => {
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

  it('non cerca quando Phrase Memory e disattivata', () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, usePhraseMemory: false },
    }));

    renderHook(() => usePhraseMemoryAutoSearch());

    expect(mockSearchPhraseMemoryBatch).not.toHaveBeenCalled();
    expect(usePhraseMemoryStore.getState().searchStatus).toBe('idle');
  });

  it('espone lo stato error se la ricerca fallisce', async () => {
    mockSearchPhraseMemoryBatch.mockRejectedValueOnce(new Error('search failed'));

    renderHook(() => usePhraseMemoryAutoSearch());

    await waitFor(() => {
      expect(usePhraseMemoryStore.getState().searchStatus).toBe('error');
    });
  });
});
