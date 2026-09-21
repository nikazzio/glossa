import { describe, expect, it } from 'vitest';
import { computeSyncState } from './transcriptionSync';

describe('computeSyncState', () => {
  it('è sincrono sulla principale, senza secondaria', () => {
    const { aligned, synced } = computeSyncState({
      activeSource: 'main',
      manualUnlinked: false,
      mainPageTotal: 100,
      siblingPageCount: null,
    });
    expect(aligned).toBe(false);
    expect(synced).toBe(true);
  });

  it('è sincrono sulla secondaria quando i conteggi combaciano', () => {
    const { aligned, synced } = computeSyncState({
      activeSource: 'sibling',
      manualUnlinked: false,
      mainPageTotal: 100,
      siblingPageCount: 100,
    });
    expect(aligned).toBe(true);
    expect(synced).toBe(true);
  });

  it('si stacca sulla secondaria quando i conteggi non combaciano', () => {
    const { aligned, synced } = computeSyncState({
      activeSource: 'sibling',
      manualUnlinked: false,
      mainPageTotal: 100,
      siblingPageCount: 96,
    });
    expect(aligned).toBe(false);
    expect(synced).toBe(false);
  });

  it('non assume mai un allineamento quando un conteggio non è noto', () => {
    const { aligned, synced } = computeSyncState({
      activeSource: 'sibling',
      manualUnlinked: false,
      mainPageTotal: null,
      siblingPageCount: 100,
    });
    expect(aligned).toBe(false);
    expect(synced).toBe(false);
  });

  it("l'interruttore manuale stacca anche sulla principale", () => {
    const { synced } = computeSyncState({
      activeSource: 'main',
      manualUnlinked: true,
      mainPageTotal: 100,
      siblingPageCount: null,
    });
    expect(synced).toBe(false);
  });

  it("l'interruttore manuale stacca anche quando i conteggi combaciano", () => {
    const { synced } = computeSyncState({
      activeSource: 'sibling',
      manualUnlinked: true,
      mainPageTotal: 100,
      siblingPageCount: 100,
    });
    expect(synced).toBe(false);
  });
});
