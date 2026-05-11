import { create } from 'zustand';
import {
  saveOperationLogEntry,
  loadOperationLogs,
  clearOperationLogs,
  type PersistedLogEntry,
} from '../services/dbService';

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
  detail?: string;
}

interface OperationLogState {
  entries: OperationLogEntry[];
  currentProjectId: string | null;
  setProjectId: (id: string | null) => void;
  append: (entry: Omit<OperationLogEntry, 'id' | 'at'>) => void;
  loadFromDb: (projectId: string) => Promise<void>;
  clear: () => void;
}

const MAX_ENTRIES = 400;

export const useOperationLogStore = create<OperationLogState>((set, get) => ({
  entries: [],
  currentProjectId: null,

  setProjectId: (id) => set({ currentProjectId: id }),

  append: (entry) => {
    const full: OperationLogEntry = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...entry,
    };
    set((state) => ({
      entries: [...state.entries, full].slice(-MAX_ENTRIES),
    }));
    const { currentProjectId } = get();
    if (currentProjectId) {
      saveOperationLogEntry(currentProjectId, full as PersistedLogEntry).catch(() => {});
    }
  },

  loadFromDb: async (projectId) => {
    const rows = await loadOperationLogs(projectId);
    set({
      entries: rows as OperationLogEntry[],
      currentProjectId: projectId,
    });
  },

  clear: () => {
    const { currentProjectId } = get();
    set({ entries: [] });
    if (currentProjectId) {
      clearOperationLogs(currentProjectId).catch(() => {});
    }
  },
}));

export function logOperation(entry: Omit<OperationLogEntry, 'id' | 'at'>): void {
  useOperationLogStore.getState().append(entry);
}
