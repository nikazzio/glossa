import { describe, it, expect, beforeEach } from 'vitest';
import { usePhraseMemoryDraftStore } from '../phraseMemoryDraftStore';

describe('phraseMemoryDraftStore', () => {
  beforeEach(() => {
    usePhraseMemoryDraftStore.getState().reset();
  });

  it('stato iniziale corretto', () => {
    expect(usePhraseMemoryDraftStore.getState().draftsByChunk.size).toBe(0);
  });

  it('setDraftCandidates popola le candidate per un frammento con stato reviewing', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftCandidates('c1', [
      { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
    ]);
    const entry = usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1');
    expect(entry?.candidates).toHaveLength(1);
    expect(entry?.status).toBe('reviewing');
  });

  it('setDraftStatus aggiorna solo lo stato del frammento indicato', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftStatus('c1', 'extracting');
    expect(usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1')?.status).toBe('extracting');
  });

  it('updateCandidate modifica solo la candidate con id indicato', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftCandidates('c1', [
      { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
      { id: 'p2', sourcePhrase: 'notte', targetPhrase: 'night', confidence: 0.9, origin: 'ai', accepted: true },
    ]);
    store.updateCandidate('c1', 'p1', { targetPhrase: 'hello world' });
    const entry = usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1');
    expect(entry?.candidates.find((c) => c.id === 'p1')?.targetPhrase).toBe('hello world');
    expect(entry?.candidates.find((c) => c.id === 'p2')?.targetPhrase).toBe('night');
  });

  it('toggleAccepted inverte lo stato accepted della candidate indicata', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftCandidates('c1', [
      { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
    ]);
    store.toggleAccepted('c1', 'p1');
    expect(usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1')?.candidates[0].accepted).toBe(false);
    store.toggleAccepted('c1', 'p1');
    expect(usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1')?.candidates[0].accepted).toBe(true);
  });

  it('removeCandidate toglie la candidate indicata dalla lista', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftCandidates('c1', [
      { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
      { id: 'p2', sourcePhrase: 'notte', targetPhrase: 'night', confidence: 0.9, origin: 'ai', accepted: true },
    ]);
    store.removeCandidate('c1', 'p1');
    const entry = usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1');
    expect(entry?.candidates.map((c) => c.id)).toEqual(['p2']);
  });

  it('addManualCandidate aggiunge una riga vuota di origine manuale, accettata di default', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftCandidates('c1', []);
    store.addManualCandidate('c1');
    const entry = usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1');
    expect(entry?.candidates).toHaveLength(1);
    expect(entry?.candidates[0]).toMatchObject({ origin: 'manual', accepted: true, sourcePhrase: '', targetPhrase: '' });
  });

  it('clearDraft rimuove interamente la bozza di un frammento', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftCandidates('c1', [
      { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
    ]);
    store.clearDraft('c1');
    expect(usePhraseMemoryDraftStore.getState().draftsByChunk.has('c1')).toBe(false);
  });

  it('seedSavedCandidates popola le candidate salvate solo se non esiste ancora una bozza per il frammento', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.seedSavedCandidates('c1', [
      { sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 1 },
    ]);
    const entry = usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1');
    expect(entry?.status).toBe('reviewing');
    expect(entry?.expanded).toBe(false);
    expect(entry?.candidates).toHaveLength(1);
    expect(entry?.candidates[0]).toMatchObject({ origin: 'saved', accepted: true, sourcePhrase: 'ciao', targetPhrase: 'hello' });
  });

  it('seedSavedCandidates non tocca una bozza già esistente per il frammento', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftCandidates('c1', [
      { id: 'p1', sourcePhrase: 'notte', targetPhrase: 'night', confidence: 0.9, origin: 'ai', accepted: false },
    ]);
    store.seedSavedCandidates('c1', [
      { sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 1 },
    ]);
    const entry = usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1');
    expect(entry?.candidates).toHaveLength(1);
    expect(entry?.candidates[0].sourcePhrase).toBe('notte');
  });

  it('toggleExpanded inverte il flag di visibilita per il frammento indicato', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.toggleExpanded('c1');
    expect(usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1')?.expanded).toBe(true);
    store.toggleExpanded('c1');
    expect(usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1')?.expanded).toBe(false);
  });

  it('la bozza di un frammento resta intatta cambiando frammento e tornando indietro', () => {
    const store = usePhraseMemoryDraftStore.getState();
    store.setDraftCandidates('c1', [
      { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
    ]);
    store.setDraftCandidates('c2', [
      { id: 'p2', sourcePhrase: 'notte', targetPhrase: 'night', confidence: 0.9, origin: 'ai', accepted: false },
    ]);
    store.toggleAccepted('c2', 'p2');

    const c1Entry = usePhraseMemoryDraftStore.getState().draftsByChunk.get('c1');
    expect(c1Entry?.candidates).toHaveLength(1);
    expect(c1Entry?.candidates[0].accepted).toBe(true);
  });
});
