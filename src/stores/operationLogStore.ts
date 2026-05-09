import { create } from 'zustand';

export type OperationLogLevel = 'info' | 'success' | 'warn' | 'error';
export type OperationLogScope =
  | 'pipeline'
  | 'preflight'
  | 'invoke'
  | 'stage'
  | 'audit'
  | 'coherence'
  | 'chunk';

export interface OperationLogEntry {
  id: string;
  at: string;
  level: OperationLogLevel;
  scope: OperationLogScope;
  message: string;
  chunkId?: string;
  stageId?: string;
  meta?: Record<string, unknown>;
}

interface OperationLogState {
  entries: OperationLogEntry[];
  append: (entry: Omit<OperationLogEntry, 'id' | 'at'>) => void;
  clear: () => void;
}

const MAX_ENTRIES = 400;

export const useOperationLogStore = create<OperationLogState>((set) => ({
  entries: [],
  append: (entry) =>
    set((state) => ({
      entries: [
        ...state.entries,
        {
          id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: new Date().toISOString(),
          ...entry,
        },
      ].slice(-MAX_ENTRIES),
    })),
  clear: () => set({ entries: [] }),
}));

export function logOperation(entry: Omit<OperationLogEntry, 'id' | 'at'>): void {
  useOperationLogStore.getState().append(entry);
}
