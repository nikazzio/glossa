import { create } from 'zustand';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  request: ConfirmRequest | null;
  resolver: ((confirmed: boolean) => void) | null;
  ask: (request: ConfirmRequest) => Promise<boolean>;
  resolve: (confirmed: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  request: null,
  resolver: null,

  ask: (request) =>
    new Promise<boolean>((resolve) => {
      const previous = get().resolver;
      if (previous) previous(false);
      set({ open: true, request, resolver: resolve });
    }),

  resolve: (confirmed) => {
    const { resolver } = get();
    set({ open: false, request: null, resolver: null });
    resolver?.(confirmed);
  },
}));

export function confirm(request: ConfirmRequest): Promise<boolean> {
  return useConfirmStore.getState().ask(request);
}
