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
}

export const useTranscriptionStore = create<TranscriptionState>((set) => ({
  detail: null,
  loading: false,
  error: null,
  loadDetail: async (documentId) => {
    set({ loading: true, error: null });
    try {
      const document = await getDocument(documentId);
      set({ detail: document, loading: false, error: document ? null : 'transcription.notFound' });
    } catch (error: unknown) {
      logger.error('transcription.document.loadFailed', { documentId, error: getErrorMessage(error) });
      set({ detail: null, loading: false, error: getErrorMessage(error) });
    }
  },
  clearDetail: () => set({ detail: null, loading: false, error: null }),
}));
