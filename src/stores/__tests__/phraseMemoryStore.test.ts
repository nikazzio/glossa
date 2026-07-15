import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePhraseMemoryStore } from '../phraseMemoryStore';
import type { PhraseMatch } from '../../types';

const makeRaw = (id: string, distance = 0.1): PhraseMatch => ({
  phraseMemoryId: id,
  sourcePhrase: `src-${id}`,
  targetPhrase: `tgt-${id}`,
  distance,
  confidence: 0.85,
});

describe('phraseMemoryStore', () => {
  beforeEach(() => {
    usePhraseMemoryStore.getState().reset();
  });

  it('stato iniziale corretto', () => {
    const { matchesByChunk, jobStatus, searchStatus } = usePhraseMemoryStore.getState();
    expect(matchesByChunk.size).toBe(0);
    expect(jobStatus).toEqual({ kind: 'idle' });
    expect(searchStatus).toBe('idle');
  });

  it('setMatches converte PhraseMatch in PhraseMemoryMatch', () => {
    const { result } = renderHook(() => usePhraseMemoryStore());
    act(() => { result.current.setMatches('chunk-1', [makeRaw('pm-1', 0.1)]); });

    const entry = result.current.matchesByChunk.get('chunk-1');
    expect(entry?.matches[0].id).toBe('pm-1');
    expect(entry?.matches[0].score).toBeCloseTo(0.9);
  });

  it('setMatches lascia i match disabilitati finche l utente non li seleziona', () => {
    usePhraseMemoryStore.getState().setMatches('c1', [makeRaw('m1'), makeRaw('m2')]);
    const entry = usePhraseMemoryStore.getState().matchesByChunk.get('c1');
    expect(entry?.enabledMatchIds.size).toBe(0);
  });

  it('setMatches preserva un match abilitato se lo stesso id ricompare nel nuovo risultato', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('c1', [makeRaw('m1'), makeRaw('m2')]);
    store.toggleMatchEnabled('c1', 'm1');
    store.setMatches('c1', [makeRaw('m1'), makeRaw('m3')]);
    const entry = usePhraseMemoryStore.getState().matchesByChunk.get('c1');
    expect(entry?.enabledMatchIds.has('m1')).toBe(true);
    expect(entry?.enabledMatchIds.has('m3')).toBe(false);
  });

  it('setMatches rimuove dagli abilitati gli id non più presenti nel nuovo risultato', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('c1', [makeRaw('m1'), makeRaw('m2')]);
    store.toggleMatchEnabled('c1', 'm1');
    store.toggleMatchEnabled('c1', 'm2');
    store.setMatches('c1', [makeRaw('m2')]);
    const entry = usePhraseMemoryStore.getState().matchesByChunk.get('c1');
    expect(entry?.enabledMatchIds.has('m1')).toBe(false);
    expect(entry?.enabledMatchIds.has('m2')).toBe(true);
  });

  it('clearMatches rimuove solo il chunk specificato', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('chunk-1', [makeRaw('pm-1')]);
    store.setMatches('chunk-2', [makeRaw('pm-2')]);
    store.clearMatches('chunk-1');
    expect(usePhraseMemoryStore.getState().matchesByChunk.has('chunk-1')).toBe(false);
    expect(usePhraseMemoryStore.getState().matchesByChunk.has('chunk-2')).toBe(true);
  });

  it('toggleMatchEnabled abilita un match disabilitato', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('c1', [makeRaw('m1')]);
    store.toggleMatchEnabled('c1', 'm1');
    expect(usePhraseMemoryStore.getState().matchesByChunk.get('c1')?.enabledMatchIds.has('m1')).toBe(true);
  });

  it('toggleMatchEnabled disabilita un match già abilitato', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('c1', [makeRaw('m1')]);
    store.toggleMatchEnabled('c1', 'm1');
    store.toggleMatchEnabled('c1', 'm1');
    expect(usePhraseMemoryStore.getState().matchesByChunk.get('c1')?.enabledMatchIds.has('m1')).toBe(false);
  });

  it('setJobStatus aggiorna lo stato del job', () => {
    const { result } = renderHook(() => usePhraseMemoryStore());
    act(() => {
      result.current.setJobStatus({ kind: 'running', chunkId: 'chunk-1', processed: 5, total: 20, estimatedCostUsd: 0.002 });
    });
    expect(result.current.jobStatus).toMatchObject({ kind: 'running', processed: 5, total: 20 });
  });

  it('setSearchStatus aggiorna lo stato della ricerca automatica', () => {
    const { result } = renderHook(() => usePhraseMemoryStore());
    act(() => {
      result.current.setSearchStatus('searching');
    });
    expect(result.current.searchStatus).toBe('searching');
  });

  it('reset ripristina lo stato iniziale', () => {
    const store = usePhraseMemoryStore.getState();
    store.setMatches('chunk-1', [makeRaw('pm-1')]);
    store.setJobStatus({ kind: 'done', totalPhrases: 42 });
    store.setSearchStatus('done');
    store.reset();
    expect(usePhraseMemoryStore.getState().matchesByChunk.size).toBe(0);
    expect(usePhraseMemoryStore.getState().jobStatus).toEqual({ kind: 'idle' });
    expect(usePhraseMemoryStore.getState().searchStatus).toBe('idle');
  });
});
