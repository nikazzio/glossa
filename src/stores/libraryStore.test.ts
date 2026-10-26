import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useLibraryStore } from './libraryStore';

vi.mock('../services/glossaryService', () => ({
  listGlossaries: vi.fn().mockResolvedValue([]),
  createGlossary: vi.fn(),
  renameGlossary: vi.fn(),
  deleteGlossary: vi.fn(),
  forkGlossary: vi.fn(),
  importEntriesFromCsv: vi.fn(),
  getGlossaryEntries: vi.fn(),
  upsertGlossaryEntries: vi.fn(),
  isGlossaryHome: vi.fn(),
  saveGlossaryEntriesAsOverrides: vi.fn(),
}));

describe('libraryStore — setShowLibraryPanel scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({ showLibraryPanel: false, activeTab: 'dictionaries', libraryScope: 'workspace',
      loadedForWorkspaceId: null, entriesMap: {}, entriesWorkspaceMap: {}, dirtyIds: [] });
  });

  it('defaults to workspace scope when opened without an explicit scope', () => {
    useLibraryStore.getState().setShowLibraryPanel(true);
    expect(useLibraryStore.getState().libraryScope).toBe('workspace');
  });

  it('switches to global scope when opened from the Dashboard', () => {
    useLibraryStore.getState().setShowLibraryPanel(true, undefined, 'global');
    expect(useLibraryStore.getState().libraryScope).toBe('global');
  });

  it('resets a previous global scope back to workspace on a plain reopen', () => {
    useLibraryStore.getState().setShowLibraryPanel(true, undefined, 'global');
    useLibraryStore.getState().setShowLibraryPanel(true, 'dictionaries');
    expect(useLibraryStore.getState().libraryScope).toBe('workspace');
  });

  it('does not change scope when closing the panel', () => {
    useLibraryStore.getState().setShowLibraryPanel(true, undefined, 'global');
    useLibraryStore.getState().setShowLibraryPanel(false);
    expect(useLibraryStore.getState().libraryScope).toBe('global');
  });

  it('copies a glossary into the explicit destination workspace and reloads it', async () => {
    const service = await import('../services/glossaryService');
    vi.mocked(service.forkGlossary).mockResolvedValue('gls-copy');
    useLibraryStore.setState({ loadedForWorkspaceId: 'ws-2' });
    await useLibraryStore.getState().forkGlossary('gls-source', 'Copia', 'ws-2');
    expect(service.forkGlossary).toHaveBeenCalledWith('gls-source', 'Copia', 'ws-2');
    expect(service.listGlossaries).toHaveBeenCalledWith('ws-2');
  });
  it('reloads canonical entries when leaving a workspace with local corrections', async () => {
    const service = await import('../services/glossaryService');
    vi.mocked(service.getGlossaryEntries).mockResolvedValue([{ id: 'entry', term: 'a', translation: 'original' }]);
    useLibraryStore.setState({ entriesMap: { dictionary: [{ id: 'entry', term: 'a', translation: 'local' }] }, entriesWorkspaceMap: { dictionary: 'guest' } });
    await useLibraryStore.getState().loadGlossaryEntries('dictionary', null);
    expect(service.getGlossaryEntries).toHaveBeenCalledWith('dictionary', null);
    expect(useLibraryStore.getState().entriesMap.dictionary[0].translation).toBe('original');
  });
  it('saves all local drafts as workspace overrides instead of changing the original', async () => {
    const service = await import('../services/glossaryService');
    vi.mocked(service.isGlossaryHome).mockResolvedValue(false);
    vi.mocked(service.getGlossaryEntries).mockResolvedValue([]);
    const entries = [{ id: 'entry', term: 'a', translation: 'local' }];
    useLibraryStore.setState({ entriesMap: { dictionary: entries }, entriesWorkspaceMap: { dictionary: 'guest' }, dirtyIds: ['dictionary'] });
    await useLibraryStore.getState().saveAllDirty();
    expect(service.saveGlossaryEntriesAsOverrides).toHaveBeenCalledWith('dictionary', 'guest', entries);
    expect(service.upsertGlossaryEntries).not.toHaveBeenCalled();
  });
  it('discards unsaved entries so reopening reads the saved values', () => {
    useLibraryStore.setState({ entriesMap: { dictionary: [] }, entriesWorkspaceMap: { dictionary: 'guest' }, dirtyIds: ['dictionary'] });
    useLibraryStore.getState().discardDirty();
    expect(useLibraryStore.getState().entriesMap.dictionary).toBeUndefined();
    expect(useLibraryStore.getState().dirtyIds).toEqual([]);
  });
});
