import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EMPTY_SEARCH, type SearchCriteria } from '../services/federatedSearchService';

interface SearchDraft {
  criteria: SearchCriteria;
  providers: string[] | null;
  setCriteria: (criteria: SearchCriteria) => void;
  setProviders: (providers: string[]) => void;
}

/**
 * Quello che torna dal disco non è un dato di cui fidarsi: una bozza scritta
 * da una versione precedente, o rovinata, non deve impedire l'apertura della
 * ricerca. Ciò che non si riconosce torna al valore vuoto.
 */
function restoreDraft(persisted: unknown): Pick<SearchDraft, 'criteria' | 'providers'> {
  const draft = (persisted ?? {}) as { criteria?: unknown; providers?: unknown };
  const saved = (draft.criteria ?? {}) as Record<string, unknown>;
  const text = (key: keyof SearchCriteria): string =>
    typeof saved[key] === 'string' ? (saved[key] as string) : '';
  const year = (key: 'yearFrom' | 'yearTo'): number | null =>
    typeof saved[key] === 'number' && Number.isFinite(saved[key]) ? (saved[key] as number) : null;
  return {
    criteria: {
      ...EMPTY_SEARCH,
      query: text('query'), title: text('title'), author: text('author'),
      publisher: text('publisher'), institution: text('institution'),
      language: text('language'), material: text('material'),
      yearFrom: year('yearFrom'), yearTo: year('yearTo'),
    },
    providers: Array.isArray(draft.providers) && draft.providers.every((key) => typeof key === 'string')
      ? (draft.providers as string[])
      : null,
  };
}

export const useFederatedSearchStore = create<SearchDraft>()(persist((set) => ({
  criteria: EMPTY_SEARCH, providers: null,
  setCriteria: (criteria) => set({criteria}),
  setProviders: (providers) => set({providers}),
}), {
  name:'glossa-search-draft',
  partialize: ({criteria,providers}) => ({criteria,providers}),
  merge: (persisted, current) => ({...current, ...restoreDraft(persisted)}),
}));
