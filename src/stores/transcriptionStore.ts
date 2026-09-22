import { create } from 'zustand';
import { getDocument, type TranscriptionDocument } from '../services/transcriptionService';
import { errorMessage as getErrorMessage, logger } from '../utils/logger';

interface TranscriptionState {
  /** Il documento aperto in Studio: serve anche al breadcrumb dell'header,
   *  che non conosce lo Studio e legge solo questo negozio (stesso schema
   *  di `sourceLibraryStore.detail` per la scheda opera). */
  detail: TranscriptionDocument | null;
  loading: boolean;
  error: string | null;
  loadDetail: (documentId: string) => Promise<void>;
  clearDetail: () => void;
  /** Aggiornamento locale dopo una scrittura già fatta sul database (#220):
   *  evita di rileggere l'intero documento per un campo cambiato. */
  patchDetail: (patch: Partial<TranscriptionDocument>) => void;
}

// Ultimo documentId richiesto: una risposta asincrona di una richiesta
// precedente (A aperto, poi B, con A che risolve per ultimo) non deve
// sovrascrivere lo stato di quella corrente.
let latestRequestId: string | null = null;

export const useTranscriptionStore = create<TranscriptionState>((set) => ({
  detail: null,
  loading: false,
  error: null,
  loadDetail: async (documentId) => {
    latestRequestId = documentId;
    set({ loading: true, error: null });
    try {
      const document = await getDocument(documentId);
      if (latestRequestId !== documentId) return;
      set({ detail: document, loading: false, error: document ? null : 'transcription.notFound' });
    } catch (error: unknown) {
      logger.error('transcription.document.loadFailed', { documentId, error: getErrorMessage(error) });
      if (latestRequestId !== documentId) return;
      set({ detail: null, loading: false, error: getErrorMessage(error) });
    }
  },
  clearDetail: () => {
    latestRequestId = null;
    set({ detail: null, loading: false, error: null });
  },
  patchDetail: (patch) => {
    set((state) => ({ detail: state.detail ? { ...state.detail, ...patch } : state.detail }));
  },
}));
