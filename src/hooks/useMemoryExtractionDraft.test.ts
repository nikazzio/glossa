import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhraseMemoryDraftStore } from '../stores/phraseMemoryDraftStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { makeTranslationChunk } from '../test/chunkFactory';
import { extractPhraseMemoryPairs, saveApprovedPhrasePairs, listPhraseMemoryEntries } from '../services/phraseMemoryService';
import type { PhraseMemoryEntry } from '../services/phraseMemoryService';
import { useMemoryExtractionDraft } from './useMemoryExtractionDraft';

vi.mock('../services/phraseMemoryService', () => ({
  extractPhraseMemoryPairs: vi.fn(),
  saveApprovedPhrasePairs: vi.fn(),
  listPhraseMemoryEntries: vi.fn(),
}));

const mockExtract = vi.mocked(extractPhraseMemoryPairs);
const mockSaveApproved = vi.mocked(saveApprovedPhrasePairs);
const mockListEntries = vi.mocked(listPhraseMemoryEntries);

const workspace = {
  id: 'ws-1',
  name: 'Workspace',
  iconKey: 'book',
  embeddingModel: 'text-embedding-3-small' as const,
  memoryExtractorProvider: 'openai' as const,
  memoryExtractorModel: 'gpt-5-nano',
  memoryExtractorPrompt: 'Extract',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const lockedChunk = makeTranslationChunk({
  id: 'c1',
  sourceProcessingText: 'Ciao mondo.',
  translationProcessingText: 'Hello world.',
  translationLocked: true,
});

function makeSavedEntry(overrides: Partial<PhraseMemoryEntry>): PhraseMemoryEntry {
  return {
    id: 'pm-1',
    workspaceId: 'ws-1',
    sourcePhrase: 'Buongiorno',
    targetPhrase: 'Good morning',
    confidence: 1,
    sourceLanguage: 'it',
    targetLanguage: 'en',
    author: null,
    work: null,
    domain: null,
    tags: null,
    notes: null,
    chunkId: 'c1',
    projectId: 'proj-1',
    embeddingModel: 'text-embedding-3-small',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('useMemoryExtractionDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListEntries.mockResolvedValue([]);
    usePhraseMemoryDraftStore.getState().reset();
    useWorkspaceStore.setState({ activeWorkspace: workspace, workspaces: [], loading: false, isLoaded: true });
    useProjectStore.setState({ currentProjectId: 'proj-1' });
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, sourceLanguage: 'it', targetLanguage: 'en' },
    }));
  });

  it('canExtract è false se il frammento non è bloccato', () => {
    const unlocked = makeTranslationChunk({ id: 'c2', translationLocked: false });
    const { result } = renderHook(() => useMemoryExtractionDraft(unlocked));
    expect(result.current.canExtract).toBe(false);
  });

  it('canExtract è true se il frammento è bloccato', () => {
    const { result } = renderHook(() => useMemoryExtractionDraft(lockedChunk));
    expect(result.current.canExtract).toBe(true);
  });

  it('extract popola le candidate accettate di default dal risultato dell IA', async () => {
    mockExtract.mockResolvedValueOnce([
      { sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', confidence: 0.9 },
    ]);
    const { result } = renderHook(() => useMemoryExtractionDraft(lockedChunk));

    await act(async () => { await result.current.extract(); });

    expect(mockExtract).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'openai',
      model: 'gpt-5-nano',
      sourceText: 'Ciao mondo.',
      targetText: 'Hello world.',
    }));
    await waitFor(() => {
      expect(result.current.candidates).toHaveLength(1);
    });
    expect(result.current.candidates[0]).toMatchObject({
      sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', origin: 'ai', accepted: true,
    });
    expect(result.current.status).toBe('reviewing');
  });

  it('addManualCandidate aggiunge una riga vuota modificabile', async () => {
    const { result } = renderHook(() => useMemoryExtractionDraft(lockedChunk));
    act(() => { result.current.addManualCandidate(); });
    await waitFor(() => expect(result.current.candidates).toHaveLength(1));
    expect(result.current.candidates[0].origin).toBe('manual');
  });

  it('confirm salva solo le righe accettate e non vuote, poi svuota la bozza', async () => {
    mockExtract.mockResolvedValueOnce([
      { sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', confidence: 0.9 },
      { sourcePhrase: 'Buona notte', targetPhrase: 'Good night', confidence: 0.8 },
    ]);
    mockSaveApproved.mockResolvedValueOnce(1);
    const { result } = renderHook(() => useMemoryExtractionDraft(lockedChunk));
    await act(async () => { await result.current.extract(); });
    await waitFor(() => expect(result.current.candidates).toHaveLength(2));

    const secondId = result.current.candidates[1].id;
    act(() => { result.current.toggleAccepted(secondId); });

    let savedCount = 0;
    await act(async () => { savedCount = await result.current.confirm(); });

    expect(mockSaveApproved).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      chunkId: 'c1',
      pairs: [{ sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', confidence: 0.9 }],
    }));
    expect(savedCount).toBe(1);
    await waitFor(() => expect(result.current.candidates).toHaveLength(0));
  });

  it('confirm non chiama il servizio se non ci sono righe accettate', async () => {
    const { result } = renderHook(() => useMemoryExtractionDraft(lockedChunk));
    act(() => { result.current.addManualCandidate(); });
    await waitFor(() => expect(result.current.candidates).toHaveLength(1));
    const id = result.current.candidates[0].id;
    act(() => { result.current.toggleAccepted(id); }); // scarta l'unica riga

    let savedCount = -1;
    await act(async () => { savedCount = await result.current.confirm(); });

    expect(mockSaveApproved).not.toHaveBeenCalled();
    expect(savedCount).toBe(0);
  });

  it('carica in automatico le frasi già salvate per il frammento', async () => {
    mockListEntries.mockResolvedValueOnce([
      makeSavedEntry({ id: 'pm-1', sourcePhrase: 'Buongiorno', targetPhrase: 'Good morning' }),
      makeSavedEntry({ id: 'pm-2', sourcePhrase: 'Buonasera', targetPhrase: 'Good evening', chunkId: 'other-chunk' }),
    ]);
    const { result } = renderHook(() => useMemoryExtractionDraft(lockedChunk));

    await waitFor(() => expect(result.current.candidates).toHaveLength(1));
    expect(result.current.candidates[0]).toMatchObject({
      sourcePhrase: 'Buongiorno', targetPhrase: 'Good morning', origin: 'saved', accepted: true,
    });
  });

  it('non ricarica le frasi salvate se esiste già una bozza in corso per il frammento', async () => {
    mockListEntries.mockResolvedValue([
      makeSavedEntry({ id: 'pm-1', sourcePhrase: 'Buongiorno', targetPhrase: 'Good morning' }),
    ]);
    const { result, rerender } = renderHook(() => useMemoryExtractionDraft(lockedChunk));
    await waitFor(() => expect(result.current.candidates).toHaveLength(1));

    act(() => { result.current.toggleAccepted(result.current.candidates[0].id); });
    rerender();
    await waitFor(() => expect(mockListEntries).toHaveBeenCalledTimes(1));

    expect(result.current.candidates[0].accepted).toBe(false);
  });

  it('extract aggiunge le nuove frasi a quelle già in bozza senza duplicare i testi identici', async () => {
    mockListEntries.mockResolvedValueOnce([
      makeSavedEntry({ id: 'pm-1', sourcePhrase: 'Buongiorno', targetPhrase: 'Good morning' }),
    ]);
    mockExtract.mockResolvedValueOnce([
      { sourcePhrase: 'buongiorno', targetPhrase: 'good morning', confidence: 0.9 },
      { sourcePhrase: 'Buona notte', targetPhrase: 'Good night', confidence: 0.8 },
    ]);
    const { result } = renderHook(() => useMemoryExtractionDraft(lockedChunk));
    await waitFor(() => expect(result.current.candidates).toHaveLength(1));

    await act(async () => { await result.current.extract(); });

    await waitFor(() => expect(result.current.candidates).toHaveLength(2));
    expect(result.current.candidates.map((c) => c.origin)).toEqual(['saved', 'ai']);
    expect(result.current.candidates[1]).toMatchObject({ sourcePhrase: 'Buona notte', targetPhrase: 'Good night' });
  });

  it('extract non perde le modifiche fatte alla bozza mentre la richiesta IA è in corso', async () => {
    let resolveExtract: (value: Array<{ sourcePhrase: string; targetPhrase: string; confidence: number }>) => void = () => {};
    mockExtract.mockImplementationOnce(() => new Promise((resolve) => { resolveExtract = resolve; }));
    const { result } = renderHook(() => useMemoryExtractionDraft(lockedChunk));
    act(() => { result.current.addManualCandidate(); });
    await waitFor(() => expect(result.current.candidates).toHaveLength(1));
    const manualId = result.current.candidates[0].id;

    let extractPromise: Promise<void> = Promise.resolve();
    act(() => { extractPromise = result.current.extract(); });
    act(() => { result.current.toggleAccepted(manualId); }); // modifica fatta mentre l'estrazione è in corso

    resolveExtract([{ sourcePhrase: 'Ciao mondo', targetPhrase: 'Hello world', confidence: 0.9 }]);
    await act(async () => { await extractPromise; });

    await waitFor(() => expect(result.current.candidates).toHaveLength(2));
    expect(result.current.candidates.find((c) => c.id === manualId)?.accepted).toBe(false);
  });
});
