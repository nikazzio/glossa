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
}));

describe('libraryStore — setShowLibraryPanel scope', () => {
  beforeEach(() => {
    useLibraryStore.setState({ showLibraryPanel: false, activeTab: 'dictionaries', libraryScope: 'workspace' });
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
});
