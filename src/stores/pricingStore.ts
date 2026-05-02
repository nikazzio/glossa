import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PricingState {
  overrides: Record<string, { input: number; output: number }>;
  setOverride: (key: string, pricing: { input: number; output: number }) => void;
  resetOverride: (key: string) => void;
  resetAll: () => void;
}

export const usePricingStore = create<PricingState>()(
  persist(
    (set) => ({
      overrides: {},
      setOverride: (key, pricing) =>
        set((state) => ({ overrides: { ...state.overrides, [key]: pricing } })),
      resetOverride: (key) =>
        set((state) => {
          const { [key]: _, ...rest } = state.overrides;
          return { overrides: rest };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: 'glossa-pricing-overrides',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
