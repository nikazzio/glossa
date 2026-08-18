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
  isGlossaryHome,
  saveGlossaryEntriesAsOverrides,
  upsertGlossaryEntries,
} from '../services/glossaryService';

export type LibraryTab = 'dictionaries' | 'templates' | 'memories';
export const DEFAULT_LIBRARY_TAB: LibraryTab = 'dictionaries';
/** 'workspace': solo dizionari del workspace attivo. 'global': catalogo cross-workspace in sola lettura. */
export type LibraryScope = 'workspace' | 'global';

interface LibraryState {
  showLibraryPanel: boolean;
  activeTab: LibraryTab;
  libraryScope: LibraryScope;
  glossaries: Glossary[];
  isLoaded: boolean;
  loadedForWorkspaceId: string | null;

  // Entries state lifted from DictionariesTab to survive panel close/reopen
  entriesMap: Record<string, GlossaryEntry[]>;
  dirtyIds: string[];
  expandedGlossaryId: string | null;

  setShowLibraryPanel: (show: boolean, tab?: LibraryTab, scope?: LibraryScope) => void;
  loadGlossaries: (workspaceId: string | null) => Promise<void>;
  reloadGlossaries: (workspaceId: string | null) => Promise<void>;
  createGlossary: (name: string, description: string | undefined, sourceLang: string | undefined, targetLang: string | undefined, workspaceId: string) => Promise<string>;
  renameGlossary: (id: string, name: string) => Promise<void>;
  deleteGlossary: (id: string) => Promise<void>;
  forkGlossary: (id: string, newName: string, destinationWorkspaceId: string) => Promise<string>;
  importCsv: (glossaryId: string, csvText: string, strategy: 'replace' | 'merge') => Promise<number>;

  // Entries management
  setGlossaryEntries: (id: string, entries: GlossaryEntry[]) => void;
  /** Con un workspace, le voci arrivano con le sue correzioni (#213). */
  loadGlossaryEntries: (id: string, workspaceId?: string | null) => Promise<void>;
  markDirty: (id: string) => void;
  clearDirty: (id: string) => void;
  setExpandedGlossaryId: (id: string | null) => void;
  saveGlossaryEntries: (id: string, workspaceId?: string | null) => Promise<void>;
  saveAllDirty: () => Promise<void>;
}

// Ordina le richieste di caricamento glossari: se cambio workspace prima che
// la richiesta precedente risponda, quella risposta tardiva non deve più
// sovrascrivere lo stato del workspace corrente.
let loadGlossariesRequestId = 0;

export const useLibraryStore = create<LibraryState>((set, get) => ({
  showLibraryPanel: false,
  activeTab: 'dictionaries',
  libraryScope: 'workspace',
  glossaries: [],
  isLoaded: false,
  loadedForWorkspaceId: null,
  entriesMap: {},
  dirtyIds: [],
  expandedGlossaryId: null,

  setShowLibraryPanel: (show, tab, scope) => {
    set({
      showLibraryPanel: show,
      // Apertura fresca (nessun tab esplicito): riparte sempre dal primo
      // tab, mai da quello lasciato aperto l'ultima volta.
      ...(show ? { activeTab: tab ?? DEFAULT_LIBRARY_TAB } : {}),
      ...(scope ? { libraryScope: scope } : show ? { libraryScope: 'workspace' } : {}),
    });
  },

  loadGlossaries: async (workspaceId) => {
    const state = get();
    if (state.isLoaded && state.loadedForWorkspaceId === workspaceId) return;
    const requestId = ++loadGlossariesRequestId;
    const glossaries = await listGlossaries(workspaceId);
    if (requestId !== loadGlossariesRequestId) return;
    set({ glossaries, isLoaded: true, loadedForWorkspaceId: workspaceId });
  },

  reloadGlossaries: async (workspaceId) => {
    const glossaries = await listGlossaries(workspaceId);
    set({ glossaries, loadedForWorkspaceId: workspaceId });
  },

  createGlossary: async (name, description, sourceLang, targetLang, workspaceId) => {
    const id = await createGlossary(name, description, sourceLang, targetLang, workspaceId);
    await get().reloadGlossaries(workspaceId ?? null);
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
      const restEntries = { ...state.entriesMap };
      delete restEntries[id];
      return {
        glossaries: state.glossaries.filter((g) => g.id !== id),
        entriesMap: restEntries,
        dirtyIds: state.dirtyIds.filter((d) => d !== id),
        expandedGlossaryId: state.expandedGlossaryId === id ? null : state.expandedGlossaryId,
      };
    });
  },

  forkGlossary: async (id, newName, destinationWorkspaceId) => {
    const newId = await forkGlossary(id, newName, destinationWorkspaceId);
    await get().reloadGlossaries(destinationWorkspaceId);
    return newId;
  },

  importCsv: async (glossaryId, csvText, strategy) => {
    return importEntriesFromCsv(glossaryId, csvText, strategy);
  },

  setGlossaryEntries: (id, entries) => {
    set((state) => ({ entriesMap: { ...state.entriesMap, [id]: entries } }));
  },

  loadGlossaryEntries: async (id, workspaceId) => {
    if (get().entriesMap[id] !== undefined) return;
    // Le voci **come le vede questo workspace**: un dizionario condiviso può
    // avere qui una correzione che altrove non c'è (#213).
    const entries = await getGlossaryEntries(id, workspaceId);
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

  saveGlossaryEntries: async (id, workspaceId) => {
    const entries = get().entriesMap[id] ?? [];
    // Chi **ospita** un dizionario non lo riscrive per tutti: le sue modifiche
    // diventano correzioni valide solo qui (#213). Chi ce l'ha in casa, invece,
    // sta modificando il dizionario.
    const home = workspaceId ? await isGlossaryHome(id, workspaceId) : true;
    if (workspaceId && !home) {
      await saveGlossaryEntriesAsOverrides(id, workspaceId, entries);
    } else {
      await upsertGlossaryEntries(id, entries);
    }
    const fresh = await getGlossaryEntries(id, workspaceId);
    set((state) => ({
      entriesMap: { ...state.entriesMap, [id]: fresh },
      dirtyIds: state.dirtyIds.filter((d) => d !== id),
    }));
  },

  saveAllDirty: async () => {
    const { dirtyIds } = get();
    const results = await Promise.allSettled(dirtyIds.map((id) => get().saveGlossaryEntries(id)));
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0) {
      throw new Error('Failed to save one or more dictionaries.');
    }
  },
}));
