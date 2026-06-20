import { create } from 'zustand';
import type { CustomProviderProfile } from '../types';
import { listCustomProviderProfiles } from '../services/customProviderService';

interface CustomProviderState {
  profiles: CustomProviderProfile[];
  isLoading: boolean;
  loadProfiles: () => Promise<void>;
  setProfiles: (profiles: CustomProviderProfile[]) => void;
}

export const useCustomProviderStore = create<CustomProviderState>((set) => ({
  profiles: [],
  isLoading: false,

  loadProfiles: async () => {
    set({ isLoading: true });
    try {
      const profiles = await listCustomProviderProfiles();
      set({ profiles });
    } finally {
      set({ isLoading: false });
    }
  },

  setProfiles: (profiles) => set({ profiles }),
}));
