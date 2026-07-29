import { create } from 'zustand';
import type { LibrarySource, LibrarySourceDetail } from '../types';
import {
  addSourceToLibrary as addSourceToLibraryService,
  getLibrarySourceDetail,
  listLibrarySources,
  setWorkspaceSourceLink as setWorkspaceSourceLinkService,
} from '../services/libraryService';
import { isManifest, type SourceCard } from '../components/dashboard/SourceDiscoveryPanel';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'library_source_add_failed';
}

interface SourceLibraryState {
  sources: LibrarySource[];
  detail: LibrarySourceDetail | null;
  addingUrls: Set<string>;
  addedManifestUrls: Set<string>;
  error: string | null;
  loadSources: () => Promise<void>;
  addFromDiscovery: (card: SourceCard, workspaceId?: string) => Promise<void>;
  loadDetail: (sourceId: string) => Promise<void>;
  toggleWorkspaceLink: (workspaceId: string, sourceId: string, linked: boolean) => Promise<void>;
}

export const useSourceLibraryStore = create<SourceLibraryState>((set, get) => ({
  sources: [],
  detail: null,
  addingUrls: new Set(),
  addedManifestUrls: new Set(),
  error: null,

  loadSources: async () => {
    const sources = await listLibrarySources();
    set({ sources });
  },

  addFromDiscovery: async (card, workspaceId) => {
    const manifestUrl = isManifest(card) ? card.manifestUrl : card.manifestUrl;
    set((state) => ({
      addingUrls: new Set(state.addingUrls).add(manifestUrl),
      error: null,
    }));
    try {
      await addSourceToLibraryService({
        manifestUrl,
        title: card.title,
        description: card.description,
        kind: 'iiif',
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

  loadDetail: async (sourceId) => {
    const detail = await getLibrarySourceDetail(sourceId);
    set({ detail });
  },

  toggleWorkspaceLink: async (workspaceId, sourceId, linked) => {
    await setWorkspaceSourceLinkService(workspaceId, sourceId, linked);
    if (get().detail?.source.id === sourceId) await get().loadDetail(sourceId);
  },
}));
