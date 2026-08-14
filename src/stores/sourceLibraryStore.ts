import { create } from 'zustand';
import {
  classifySourceKind,
  type LibraryCatalogEntry,
  type LibrarySource,
  type LibrarySourceDetail,
  type SourceCard,
} from '../types';
import {
  addSourceToLibrary as addSourceToLibraryService,
  getLibrarySourceDetail,
  listLibraryCatalog,
  listLibrarySourceUrls,
  listLibrarySources,
  removeSourceFromLibrary as removeSourceFromLibraryService,
  setWorkspaceSourceLink as setWorkspaceSourceLinkService,
} from '../services/libraryService';
import { logger } from '../utils/logger';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'library_source_add_failed';
}

interface SourceLibraryState {
  sources: LibrarySource[];
  detail: LibrarySourceDetail | null;
  addingUrls: Set<string>;
  addedManifestUrls: Set<string>;
  libraryManifestUrls: Set<string>;
  error: string | null;
  loadSources: () => Promise<void>;
  loadLibraryManifestUrls: () => Promise<void>;
  addFromDiscovery: (card: SourceCard, workspaceId?: string) => Promise<void>;
  catalog: LibraryCatalogEntry[];
  loadCatalog: () => Promise<void>;
  removeSource: (sourceId: string) => Promise<void>;
  loadDetail: (sourceId: string) => Promise<void>;
  toggleWorkspaceLink: (workspaceId: string, sourceId: string, linked: boolean) => Promise<void>;
  clearError: () => void;
}

export const useSourceLibraryStore = create<SourceLibraryState>((set, get) => ({
  sources: [],
  detail: null,
  addingUrls: new Set(),
  addedManifestUrls: new Set(),
  libraryManifestUrls: new Set(),
  error: null,

  loadSources: async () => {
    const sources = await listLibrarySources();
    set({ sources });
  },

  loadLibraryManifestUrls: async () => {
    try {
      const urls = await listLibrarySourceUrls();
      set({ libraryManifestUrls: new Set(urls) });
    } catch (error) {
      logger.error('loadLibraryManifestUrls failed', { error: getErrorMessage(error) });
    }
  },

  addFromDiscovery: async (card, workspaceId) => {
    const manifestUrl = card.manifestUrl;
    set((state) => ({
      addingUrls: new Set(state.addingUrls).add(manifestUrl),
      error: null,
    }));
    try {
      await addSourceToLibraryService({
        manifestUrl,
        title: card.title,
        description: card.description,
        kind: classifySourceKind(card),
        creator: card.creator,
        date: card.date,
        thumbnailUrl: card.thumbnailUrl,
        language: card.language,
        subjects: card.subjects,
        workspaceId,
      });
      set((state) => ({ addedManifestUrls: new Set(state.addedManifestUrls).add(manifestUrl) }));
      await get().loadSources();
    } catch (error: unknown) {
      set({ error: getErrorMessage(error) });
    } finally {
      set((state) => {
        const addingUrls = new Set(state.addingUrls);
        addingUrls.delete(manifestUrl);
        return { addingUrls };
      });
    }
  },

  catalog: [],

  loadCatalog: async () => {
    try {
      set({ catalog: await listLibraryCatalog() });
    } catch (error: unknown) {
      set({ error: getErrorMessage(error) });
    }
  },

  removeSource: async (sourceId) => {
    try {
      await removeSourceFromLibraryService(sourceId);
      await get().loadCatalog();
      await get().loadLibraryManifestUrls();
    } catch (error: unknown) {
      set({ error: getErrorMessage(error) });
    }
  },

  loadDetail: async (sourceId) => {
    const detail = await getLibrarySourceDetail(sourceId);
    set({ detail });
  },

  toggleWorkspaceLink: async (workspaceId, sourceId, linked) => {
    await setWorkspaceSourceLinkService(workspaceId, sourceId, linked);
    if (get().detail?.source.id === sourceId) await get().loadDetail(sourceId);
  },

  clearError: () => set({ error: null }),
}));
