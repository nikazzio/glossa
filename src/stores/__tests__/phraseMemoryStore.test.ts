import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePhraseMemoryStore } from '../phraseMemoryStore';

describe('phraseMemoryStore', () => {
  beforeEach(() => {
    usePhraseMemoryStore.getState().reset();
  });

  it('stato iniziale corretto', () => {
    const { matchesByChunkId, jobStatus } = usePhraseMemoryStore.getState();
    expect(matchesByChunkId).toEqual({});
    expect(jobStatus).toEqual({ kind: 'idle' });
  });

  it('setMatches aggiorna i match per un chunk', () => {
    const { result } = renderHook(() => usePhraseMemoryStore());
    const matches = [{ phraseMemoryId: 'pm-1', sourcePhrase: 'ciao', targetPhrase: 'hello', distance: 0.1 }];

    act(() => { result.current.setMatches('chunk-1', matches); });

    expect(result.current.matchesByChunkId['chunk-1']).toEqual(matches);
  });

  it('clearMatches rimuove solo il chunk specificato', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('chunk-1', [{ phraseMemoryId: 'pm-1', sourcePhrase: 'a', targetPhrase: 'b', distance: 0.1 }]);
    store.setMatches('chunk-2', [{ phraseMemoryId: 'pm-2', sourcePhrase: 'c', targetPhrase: 'd', distance: 0.2 }]);

    store.clearMatches('chunk-1');

    const state = usePhraseMemoryStore.getState();
    expect(state.matchesByChunkId['chunk-1']).toBeUndefined();
    expect(state.matchesByChunkId['chunk-2']).toBeDefined();
  });

  it('setJobStatus aggiorna lo stato del job', () => {
    const { result } = renderHook(() => usePhraseMemoryStore());

    act(() => {
      result.current.setJobStatus({ kind: 'running', processed: 5, total: 20, estimatedCostUsd: 0.002 });
    });

    expect(result.current.jobStatus).toMatchObject({ kind: 'running', processed: 5, total: 20 });
  });

  it('reset ripristina lo stato iniziale', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('chunk-1', [{ phraseMemoryId: 'pm-1', sourcePhrase: 'x', targetPhrase: 'y', distance: 0.05 }]);
    store.setJobStatus({ kind: 'done', totalPhrases: 42 });

    store.reset();

    const state = usePhraseMemoryStore.getState();
    expect(state.matchesByChunkId).toEqual({});
    expect(state.jobStatus).toEqual({ kind: 'idle' });
  });
});
