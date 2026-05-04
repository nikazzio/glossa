import { create } from 'zustand';
import type { Glossary, GlossaryEntry } from '../types';
import {
  listGlossaries,
  createGlossary,
  renameGlossary,
  deleteGlossary,
  forkGlossary,
  importEntriesFromCsv,
  getGlossaryEntries,
  upsertGlossaryEntries,
} from '../services/glossaryService';

export type LibraryTab = 'dictionaries' | 'templates';

interface LibraryState {
  showLibraryPanel: boolean;
  activeTab: LibraryTab;
  glossaries: Glossary[];
  isLoaded: boolean;

  // Entries state lifted from DictionariesTab to survive panel close/reopen
  entriesMap: Record<string, GlossaryEntry[]>;
  dirtyIds: string[];
  expandedGlossaryId: string | null;

  setShowLibraryPanel: (show: boolean, tab?: LibraryTab) => void;
  loadGlossaries: () => Promise<void>;
  reloadGlossaries: () => Promise<void>;
  createGlossary: (name: string, description?: string, sourceLang?: string, targetLang?: string) => Promise<string>;
  renameGlossary: (id: string, name: string) => Promise<void>;
  deleteGlossary: (id: string) => Promise<void>;
  forkGlossary: (id: string, newName: string) => Promise<string>;
  importCsv: (glossaryId: string, csvText: string, strategy: 'replace' | 'merge') => Promise<number>;

  // Entries management
  setGlossaryEntries: (id: string, entries: GlossaryEntry[]) => void;
  loadGlossaryEntries: (id: string) => Promise<void>;
  markDirty: (id: string) => void;
  clearDirty: (id: string) => void;
  setExpandedGlossaryId: (id: string | null) => void;
  saveGlossaryEntries: (id: string) => Promise<void>;
  saveAllDirty: () => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  showLibraryPanel: false,
  activeTab: 'dictionaries',
  glossaries: [],
  isLoaded: false,
  entriesMap: {},
  dirtyIds: [],
  expandedGlossaryId: null,

  setShowLibraryPanel: (show, tab) => {
    set({ showLibraryPanel: show, ...(tab ? { activeTab: tab } : {}) });
    if (show && !get().isLoaded) {
      get().loadGlossaries();
    }
  },

  loadGlossaries: async () => {
    if (get().isLoaded) return;
    const glossaries = await listGlossaries();
    set({ glossaries, isLoaded: true });
  },

  reloadGlossaries: async () => {
    const glossaries = await listGlossaries();
    set({ glossaries });
  },

  createGlossary: async (name, description, sourceLang, targetLang) => {
    const id = await createGlossary(name, description, sourceLang, targetLang);
    await get().reloadGlossaries();
    return id;
  },

  renameGlossary: async (id, name) => {
    await renameGlossary(id, name);
    set((state) => ({
      glossaries: state.glossaries.map((g) => (g.id === id ? { ...g, name } : g)),
    }));
  },

  deleteGlossary: async (id) => {
    await deleteGlossary(id);
    set((state) => {
      const { [id]: _removed, ...restEntries } = state.entriesMap;
      return {
        glossaries: state.glossaries.filter((g) => g.id !== id),
        entriesMap: restEntries,
        dirtyIds: state.dirtyIds.filter((d) => d !== id),
        expandedGlossaryId: state.expandedGlossaryId === id ? null : state.expandedGlossaryId,
      };
    });
  },

  forkGlossary: async (id, newName) => {
    const newId = await forkGlossary(id, newName);
    await get().reloadGlossaries();
    return newId;
  },

  importCsv: async (glossaryId, csvText, strategy) => {
    return importEntriesFromCsv(glossaryId, csvText, strategy);
  },

  setGlossaryEntries: (id, entries) => {
    set((state) => ({ entriesMap: { ...state.entriesMap, [id]: entries } }));
  },

  loadGlossaryEntries: async (id) => {
    if (get().entriesMap[id] !== undefined) return;
    const entries = await getGlossaryEntries(id);
    set((state) => ({ entriesMap: { ...state.entriesMap, [id]: entries } }));
  },

  markDirty: (id) => {
    set((state) => ({
      dirtyIds: state.dirtyIds.includes(id) ? state.dirtyIds : [...state.dirtyIds, id],
    }));
  },

  clearDirty: (id) => {
    set((state) => ({ dirtyIds: state.dirtyIds.filter((d) => d !== id) }));
  },

  setExpandedGlossaryId: (id) => {
    set({ expandedGlossaryId: id });
  },

  saveGlossaryEntries: async (id) => {
    const entries = get().entriesMap[id] ?? [];
    await upsertGlossaryEntries(id, entries);
    // Reload from DB so UI reflects actual persisted state
    const fresh = await getGlossaryEntries(id);
    set((state) => ({
      entriesMap: { ...state.entriesMap, [id]: fresh },
      dirtyIds: state.dirtyIds.filter((d) => d !== id),
    }));
  },

  saveAllDirty: async () => {
    const { dirtyIds } = get();
    await Promise.allSettled(dirtyIds.map((id) => get().saveGlossaryEntries(id)));
  },
}));
