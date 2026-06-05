import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunksStore } from '../stores/chunksStore';
import { usePhraseMemoryStore } from '../stores/phraseMemoryStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { makeTranslationChunk } from '../test/chunkFactory';
import { saveSelectedPhrases } from '../services/phraseMemoryService';
import { useSaveToMemory } from './useSaveToMemory';

vi.mock('../services/phraseMemoryService', () => ({
  saveSelectedPhrases: vi.fn(),
}));

vi.mock('../utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const mockSaveSelectedPhrases = vi.mocked(saveSelectedPhrases);

describe('useSaveToMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSaveSelectedPhrases.mockResolvedValue(1);

    useWorkspaceStore.setState({
      activeWorkspace: {
        id: 'ws-1',
        name: 'Workspace',
        embeddingModel: 'text-embedding-3-small',
        memoryExtractorProvider: 'openai',
        memoryExtractorModel: 'gpt-5-nano',
        memoryExtractorPrompt: 'Extract',
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
        sourceLanguage: 'Italian',
        targetLanguage: 'English',
      },
    }));
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'c1',
          sourceProcessingText: 'Ciao mondo.',
          currentDraft: 'Hello world.',
          status: 'ready',
          translationLocked: false,
        }),
        makeTranslationChunk({
          id: 'c2',
          sourceProcessingText: 'Buona notte.',
          currentDraft: 'Good night.',
          status: 'completed',
          translationLocked: true,
        }),
      ],
      isProcessing: false,
      cancelRequested: false,
      activeStreamId: null,
    });
    usePhraseMemoryStore.getState().reset();
  });

  it('salva solo i chunk selezionati dalla UI', async () => {
    const { result } = renderHook(() => useSaveToMemory());
    let savedCount = 0;

    await act(async () => {
      savedCount = await result.current.saveToMemory(['c1']);
    });

    expect(savedCount).toBe(1);
    expect(mockSaveSelectedPhrases).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      extractorProvider: 'openai',
      extractorModel: 'gpt-5-nano',
      extractorPrompt: 'Extract',
      chunks: [
        {
          id: 'c1',
          sourceText: 'Ciao mondo.',
          targetText: 'Hello world.',
        },
      ],
    }));
  });

  it('ritorna il numero reale di frasi salvate dal service', async () => {
    mockSaveSelectedPhrases.mockResolvedValueOnce(3);
    const { result } = renderHook(() => useSaveToMemory());
    let savedCount = 0;

    await act(async () => {
      savedCount = await result.current.saveToMemory(['c1']);
    });

    expect(savedCount).toBe(3);
    expect(usePhraseMemoryStore.getState().jobStatus).toEqual({ kind: 'done', totalPhrases: 3 });
  });

  it('non salva chunk locked o completed se non sono selezionati', async () => {
    const { result } = renderHook(() => useSaveToMemory());

    await act(async () => {
      await result.current.saveToMemory(['c1']);
    });

    const call = mockSaveSelectedPhrases.mock.calls[0]?.[0];
    expect(call?.chunks.map((chunk) => chunk.id)).toEqual(['c1']);
  });

  it('ritorna 0 senza chiamare il service se manca una selezione valida', async () => {
    const { result } = renderHook(() => useSaveToMemory());
    let savedCount = 1;

    await act(async () => {
      savedCount = await result.current.saveToMemory([]);
    });

    expect(savedCount).toBe(0);
    expect(mockSaveSelectedPhrases).not.toHaveBeenCalled();
  });
});
