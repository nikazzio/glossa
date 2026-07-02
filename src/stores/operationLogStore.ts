import { create } from 'zustand';
import {
  saveOperationLogEntry,
  loadOperationLogs,
  clearOperationLogs,
  type PersistedLogEntry,
} from '../services/dbService';
import { logger } from '../utils/logger';

export type OperationLogLevel = 'info' | 'success' | 'warn' | 'error';
export type OperationLogScope =
  | 'pipeline'
  | 'preflight'
  | 'invoke'
  | 'stage'
  | 'audit'
  | 'coherence'
  | 'memory'
  | 'chunk';
export type OperationLogPhase = 'start' | 'end' | 'retry' | 'cache';
export type OperationLogDetailKind = 'prompt' | 'json' | 'error' | 'note';

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
  phase?: OperationLogPhase;
  durationMs?: number;
  detailKind?: OperationLogDetailKind;
}

interface OperationLogState {
  entries: OperationLogEntry[];
  currentProjectId: string | null;
  setProjectId: (id: string | null) => void;
  append: (entry: Omit<OperationLogEntry, 'id' | 'at'>) => void;
  loadFromDb: (projectId: string) => Promise<void>;
  clearChunk: (chunkId: string) => void;
  clear: () => void;
}

const MAX_ENTRIES = 2000;

export const useOperationLogStore = create<OperationLogState>((set, get) => ({
  entries: [],
  currentProjectId: null,

  setProjectId: (id) => {
    const previousProjectId = get().currentProjectId;
    set({ currentProjectId: id });
    // First save of a fresh project: entries logged while running without a
    // saved project id yet were never persisted — backfill them now.
    if (id && !previousProjectId) {
      for (const entry of get().entries) {
        void saveOperationLogEntry(id, entry as PersistedLogEntry).catch((error: unknown) => {
          logger.warn('operationLog.backfill_failed', {
            projectId: id,
            entryId: entry.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }
  },

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
      void saveOperationLogEntry(currentProjectId, full as PersistedLogEntry).catch((error: unknown) => {
        logger.warn('operationLog.persist_failed', {
          projectId: currentProjectId,
          entryId: full.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  },

  loadFromDb: async (projectId) => {
    const rows = await loadOperationLogs(projectId);
    set({
      entries: rows as OperationLogEntry[],
      currentProjectId: projectId,
    });
  },

  clearChunk: (chunkId: string) => {
    set((state) => ({
      entries: state.entries.filter((e) => e.chunkId !== chunkId),
    }));
  },

  clear: () => {
    const { currentProjectId } = get();
    set({ entries: [] });
    if (currentProjectId) {
      void clearOperationLogs(currentProjectId).catch((error: unknown) => {
        logger.warn('operationLog.clear_failed', {
          projectId: currentProjectId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  },
}));

export function logOperation(entry: Omit<OperationLogEntry, 'id' | 'at'>): void {
  useOperationLogStore.getState().append(entry);
}
