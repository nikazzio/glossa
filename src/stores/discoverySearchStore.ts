import { create } from 'zustand';
import type { IIIFDiscoveryOutcome } from '../types';

interface DiscoverySearchState {
  providerKey: string;
  /** Vero appena l'utente sceglie una fonte a mano: da quel momento la
   *  preferenza non gliela cambia più sotto le mani. */
  touched: boolean;
  input: string;
  outcome: IIIFDiscoveryOutcome | null;
  page: number;
  expandedId: string | null;
  /** Il motivo del guasto, come lo racconta il motore: «ricerca non
   *  disponibile» mandava a cercare l'errore dalla parte sbagliata, perché un
   *  rifiuto automatico e un servizio spento non sono la stessa cosa. */
  searchError: string | null;
  setProviderKey: (providerKey: string) => void;
  setInput: (input: string) => void;
  setOutcome: (outcome: IIIFDiscoveryOutcome | null) => void;
  setPage: (page: number) => void;
  setExpandedId: (id: string | null | ((current: string | null) => string | null)) => void;
  setSearchError: (message: string | null) => void;
}

/** Stato della ricerca fonti in Dashboard, separato da uiStore: sopravvive alla
 * navigazione verso un'altra area e ritorno (non si resetta all'unmount del
 * pannello), ma non persiste su disco — si azzera solo al riavvio app. */
export const useDiscoverySearchStore = create<DiscoverySearchState>((set) => ({
  providerKey: 'archive_org',
  touched: false,
  input: '',
  outcome: null,
  page: 1,
  expandedId: null,
  searchError: null,

  setProviderKey: (providerKey) => set({ providerKey }),
  setInput: (input) => set({ input }),
  setOutcome: (outcome) => set({ outcome }),
  setPage: (page) => set({ page }),
  setExpandedId: (id) =>
    set((state) => ({ expandedId: typeof id === 'function' ? id(state.expandedId) : id })),
  setSearchError: (searchError) => set({ searchError }),
}));
