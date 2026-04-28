import { create } from 'zustand';
import type { Glossary } from '../types';
import {
  listGlossaries,
  createGlossary,
  renameGlossary,
  deleteGlossary,
  forkGlossary,
  importEntriesFromCsv,
} from '../services/glossaryService';

export type LibraryTab = 'dictionaries' | 'templates';

interface LibraryState {
  showLibraryPanel: boolean;
  activeTab: LibraryTab;
  glossaries: Glossary[];
  isLoaded: boolean;
  setShowLibraryPanel: (show: boolean, tab?: LibraryTab) => void;
  loadGlossaries: () => Promise<void>;
  reloadGlossaries: () => Promise<void>;
  createGlossary: (name: string, description?: string, sourceLang?: string, targetLang?: string) => Promise<string>;
  renameGlossary: (id: string, name: string) => Promise<void>;
  deleteGlossary: (id: string) => Promise<void>;
  forkGlossary: (id: string, newName: string) => Promise<string>;
  importCsv: (glossaryId: string, csvText: string, strategy: 'replace' | 'merge') => Promise<number>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  showLibraryPanel: false,
  activeTab: 'dictionaries',
  glossaries: [],
  isLoaded: false,

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
    set((state) => ({ glossaries: state.glossaries.filter((g) => g.id !== id) }));
  },

  forkGlossary: async (id, newName) => {
    const newId = await forkGlossary(id, newName);
    await get().reloadGlossaries();
    return newId;
  },

  importCsv: async (glossaryId, csvText, strategy) => {
    return importEntriesFromCsv(glossaryId, csvText, strategy);
  },
}));
