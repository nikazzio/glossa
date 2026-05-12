import { create } from 'zustand';
import type { PreflightCheckResult } from '../services/llmService';

interface PreflightState {
  open: boolean;
  results: PreflightCheckResult[];
  resolver: ((proceed: boolean) => void) | null;
  /** Open the dialog with given results. Resolves with true if the user proceeds, false if they cancel. */
  show: (results: PreflightCheckResult[]) => Promise<boolean>;
  resolve: (proceed: boolean) => void;
}

export const usePreflightStore = create<PreflightState>((set, get) => ({
  open: false,
  results: [],
  resolver: null,

  show: (results) =>
    new Promise<boolean>((resolve) => {
      const previous = get().resolver;
      if (previous) previous(false);
      set({ open: true, results, resolver: resolve });
    }),

  resolve: (proceed) => {
    const { resolver } = get();
    set({ open: false, results: [], resolver: null });
    resolver?.(proceed);
  },
}));

export function showPreflightDialog(results: PreflightCheckResult[]): Promise<boolean> {
  return usePreflightStore.getState().show(results);
}
