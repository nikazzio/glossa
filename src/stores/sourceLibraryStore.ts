import { create } from 'zustand';
import {
  classifySourceKind,
  isManifest,
  type LibraryCatalogEntry,
  type LibrarySourceDetail,
  type SourceCollection,
  type SourceField,
  type SourceCard,
} from '../types';
import {
  addSourceToLibrary as addSourceToLibraryService,
  getLibrarySourceDetail,
  listLibraryCatalog,
  listLibrarySourceUrls,
  removeSourceFromLibrary as removeSourceFromLibraryService,
  setSourceArchived as setSourceArchivedService,
  setSourceFieldOverride as setSourceFieldOverrideService,
  setWorkspaceSourceLink as setWorkspaceSourceLinkService,
} from '../services/libraryService';
import {
  collectionsOfMany,
  createCollection as createCollectionService,
  deleteCollection as deleteCollectionService,
  listCollections,
  setSourceCollection,
} from '../services/libraryCollectionsService';
import { errorMessage as getErrorMessage, logger } from '../utils/logger';

interface SourceLibraryState {
  detail: LibrarySourceDetail | null;
  addingUrls: Set<string>;
  addedManifestUrls: Set<string>;
  libraryManifestUrls: Set<string>;
  /** Id dell'opera per ogni manifesto già in biblioteca: serve a chiedere a
   * quali workspace è già collegata senza rileggere tutto il catalogo. */
  libraryManifestSourceIds: Map<string, string>;
  error: string | null;
  loadLibraryManifestUrls: () => Promise<void>;
  addFromDiscovery: (card: SourceCard, workspaceId?: string, providerKey?: string) => Promise<void>;
  catalog: LibraryCatalogEntry[];
  /** Il catalogo: **tutte** le opere, sempre (#213). */
  loadCatalog: () => Promise<void>;
  removeSource: (sourceId: string) => Promise<void>;
  /** Archivia o rimette in circolo un'opera, poi rilegge il catalogo. */
  setArchived: (sourceId: string, archived: boolean) => Promise<void>;
  /** Corregge a mano un campo dell'opera; `null` riporta il dato originale. */
  correctField: (sourceId: string, field: SourceField, value: string | null) => Promise<void>;
  collections: SourceCollection[];
  loadCollections: () => Promise<void>;
  /** Aggiunge o toglie l'opera da una collezione; il nome crea la collezione. */
  setCollection: (sourceId: string, collectionId: string, member: boolean) => Promise<void>;
  addToNewCollection: (sourceId: string, name: string) => Promise<void>;
  deleteCollection: (collectionId: string) => Promise<void>;
  refreshSourceCollections: (sourceId: string) => Promise<void>;
  loadDetail: (sourceId: string) => Promise<void>;
  toggleWorkspaceLink: (workspaceId: string, sourceId: string, linked: boolean) => Promise<void>;
  clearError: () => void;
}

export const useSourceLibraryStore = create<SourceLibraryState>((set, get) => ({
  detail: null,
  addingUrls: new Set(),
  addedManifestUrls: new Set(),
  libraryManifestUrls: new Set(),
  libraryManifestSourceIds: new Map(),
  error: null,

  loadLibraryManifestUrls: async () => {
    try {
      const rows = await listLibrarySourceUrls();
      set({
        libraryManifestUrls: new Set(rows.map((row) => row.sourceUrl)),
        libraryManifestSourceIds: new Map(rows.map((row) => [row.sourceUrl, row.sourceId])),
      });
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
      const { sourceId } = await addSourceToLibraryService({
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
        // Lo dichiarano entrambe le schede: quella del manifesto lo conta
        // dai canvas, quella della ricerca lo prende dalla biblioteca.
        itemCount: card.itemCount,
        workspaceId,
        // Entrambe le schede portano questi dati: quella di ricerca dalla
        // risposta strutturata della biblioteca, quella del manifesto diretto
        // dal `metadata`/`homepage` del manifesto stesso, quando lo dichiara.
        contributors: card.contributors,
        publisher: card.publisher,
        rights: card.rights,
        physicalDescription: card.physicalDescription,
        holdingInstitution: card.holdingInstitution,
        // Solo la scheda di ricerca porta un link alla scheda del catalogo
        // cartaceo: non c'è un campo IIIF generico da cui leggerlo per un
        // manifesto preso al volo.
        catalogUrl: isManifest(card) ? null : card.catalogUrl,
        pageUrl: card.pageUrl,
      });
      set((state) => ({
        addedManifestUrls: new Set(state.addedManifestUrls).add(manifestUrl),
        libraryManifestSourceIds: new Map(state.libraryManifestSourceIds).set(manifestUrl, sourceId),
      }));
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

  setArchived: async (sourceId, archived) => {
    await setSourceArchivedService(sourceId, archived);
    await get().loadCatalog();
    if (get().detail?.source.id === sourceId) await get().loadDetail(sourceId);
  },

  correctField: async (sourceId, field, value) => {
    await setSourceFieldOverrideService(sourceId, field, value);
    await get().loadCatalog();
    if (get().detail?.source.id === sourceId) await get().loadDetail(sourceId);
  },

  collections: [],

  loadCollections: async () => {
    try {
      set({ collections: await listCollections() });
    } catch (error: unknown) {
      logger.error('loadCollections failed', { error: getErrorMessage(error) });
    }
  },

  setCollection: async (sourceId, collectionId, member) => {
    await setSourceCollection(collectionId, sourceId, member);
    await get().refreshSourceCollections(sourceId);
  },

  addToNewCollection: async (sourceId, name) => {
    const collection = await createCollectionService(name);
    await setSourceCollection(collection.id, sourceId, true);
    await get().loadCollections();
    await get().refreshSourceCollections(sourceId);
  },

  deleteCollection: async (collectionId) => {
    await deleteCollectionService(collectionId);
    await get().loadCollections();
    await get().loadCatalog();
    const openId = get().detail?.source.id;
    if (openId) await get().loadDetail(openId);
  },

  /** Rilegge solo le collezioni di quell'opera: il catalogo intero non serve. */
  refreshSourceCollections: async (sourceId) => {
    const collections = (await collectionsOfMany([sourceId])).get(sourceId) ?? [];
    set((state) => ({
      catalog: state.catalog.map((entry) =>
        entry.source.id === sourceId ? { ...entry, collections } : entry,
      ),
      detail:
        state.detail?.source.id === sourceId ? { ...state.detail, collections } : state.detail,
    }));
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
