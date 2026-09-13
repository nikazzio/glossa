import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EMPTY_SEARCH, type SearchCriteria } from '../services/federatedSearchService';

interface SearchDraft {
  criteria: SearchCriteria;
  providers: string[] | null;
  setCriteria: (criteria: SearchCriteria) => void;
  setProviders: (providers: string[]) => void;
}
export const useFederatedSearchStore = create<SearchDraft>()(persist((set) => ({
  criteria: EMPTY_SEARCH, providers: null,
  setCriteria: (criteria) => set({criteria}),
  setProviders: (providers) => set({providers}),
}), {name:'glossa-search-draft', partialize: ({criteria,providers}) => ({criteria,providers})}));
