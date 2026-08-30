import { create } from 'zustand';
import {
  deleteSavedView as deleteSavedViewService,
  listSavedViews,
  saveView as saveViewService,
  type LibrarySavedView,
} from '../services/librarySavedViewsService';
import { logger } from '../utils/logger';
import type { LibraryFilters } from '../utils/libraryCatalogFilters';

interface LibrarySavedViewsState {
  views: LibrarySavedView[];
  load: () => Promise<void>;
  save: (name: string, filters: LibraryFilters) => Promise<void>;
  remove: (viewId: string) => Promise<void>;
}

/** Le viste salvate della Biblioteca: filtri con un nome, richiamabili. */
export const useLibrarySavedViewsStore = create<LibrarySavedViewsState>((set, get) => ({
  views: [],

  load: async () => {
    try {
      set({ views: await listSavedViews() });
    } catch (error: unknown) {
      logger.error('loadSavedViews failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  save: async (name, filters) => {
    await saveViewService(name, filters);
    await get().load();
  },

  remove: async (viewId) => {
    await deleteSavedViewService(viewId);
    await get().load();
  },
}));
