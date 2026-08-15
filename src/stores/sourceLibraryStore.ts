import { create } from 'zustand';
import {
  classifySourceKind,
  isManifest,
  type LibraryCatalogEntry,
  type LibrarySourceDetail,
  type SourceCard,
} from '../types';
import {
  addSourceToLibrary as addSourceToLibraryService,
  getLibrarySourceDetail,
  listLibraryCatalog,
  listLibrarySourceUrls,
  removeSourceFromLibrary as removeSourceFromLibraryService,
  setWorkspaceSourceLink as setWorkspaceSourceLinkService,
} from '../services/libraryService';
import { logger } from '../utils/logger';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'library_source_add_failed';
}

interface SourceLibraryState {
  detail: LibrarySourceDetail | null;
  addingUrls: Set<string>;
  addedManifestUrls: Set<string>;
  libraryManifestUrls: Set<string>;
  error: string | null;
  loadLibraryManifestUrls: () => Promise<void>;
  addFromDiscovery: (card: SourceCard, workspaceId?: string, providerKey?: string) => Promise<void>;
  catalog: LibraryCatalogEntry[];
  loadCatalog: () => Promise<void>;
  removeSource: (sourceId: string) => Promise<void>;
  loadDetail: (sourceId: string) => Promise<void>;
  toggleWorkspaceLink: (workspaceId: string, sourceId: string, linked: boolean) => Promise<void>;
  clearError: () => void;
}

export const useSourceLibraryStore = create<SourceLibraryState>((set, get) => ({
  detail: null,
  addingUrls: new Set(),
  addedManifestUrls: new Set(),
  libraryManifestUrls: new Set(),
  error: null,

  loadLibraryManifestUrls: async () => {
    try {
      const urls = await listLibrarySourceUrls();
      set({ libraryManifestUrls: new Set(urls) });
    } catch (error) {
      logger.error('loadLibraryManifestUrls failed', { error: getErrorMessage(error) });
    }
  },

  addFromDiscovery: async (card, workspaceId, providerKey) => {
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
        providerKey: providerKey ?? null,
        externalId: isManifest(card) ? null : card.id,
        mediaType: isManifest(card) ? null : card.mediaType,
        materialType: isManifest(card) ? card.materialType : null,
        collection: isManifest(card) ? null : card.collection,
        volume: card.volume,
        itemCount: isManifest(card) ? card.itemCount : null,
        workspaceId,
      });
      set((state) => ({ addedManifestUrls: new Set(state.addedManifestUrls).add(manifestUrl) }));
      // Il catalogo si rilegge: la fonte appena aggiunta deve comparire in
      // Biblioteca senza riaprire la schermata.
      await get().loadCatalog();
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
