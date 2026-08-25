import { create } from 'zustand';
import {
  saveOperationLogEntry,
  loadOperationLogs,
  clearOperationLogs,
  type PersistedLogEntry,
  type ChunkUsageBump,
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
  // Campi tipizzati per analisi (costo/token per modello nel tempo, qualità
  // per modello/fase, efficacia cache) — `costUsd` è congelato al momento
  // della scrittura con il listino prezzi allora in vigore, non va
  // ricalcolato in lettura con il listino attuale.
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  cacheMissInputTokens?: number;
  costUsd?: number;
  isFree?: boolean;
  attemptNumber?: number;
  maxAttempts?: number;
}

interface OperationLogState {
  entries: OperationLogEntry[];
  currentProjectId: string | null;
  currentPipelineId: string | null;
  setContext: (projectId: string | null, pipelineId: string | null) => void;
  append: (entry: Omit<OperationLogEntry, 'id' | 'at'>, chunkUsageBump?: ChunkUsageBump) => void;
  loadFromDb: (projectId: string, pipelineId: string) => Promise<void>;
  clearChunk: (chunkId: string) => void;
  clear: () => void;
}

export const useOperationLogStore = create<OperationLogState>((set, get) => ({
  entries: [],
  currentProjectId: null,
  currentPipelineId: null,

  setContext: (projectId, pipelineId) => {
    const { currentProjectId: previousProjectId, currentPipelineId: previousPipelineId } = get();
    set({ currentProjectId: projectId, currentPipelineId: pipelineId });
    const hadFullContext = Boolean(previousProjectId && previousPipelineId);
    const hasFullContext = Boolean(projectId && pipelineId);
    // First save of a fresh project/pipeline: entries logged while running
    // without a saved id yet were never persisted — backfill them now.
    if (hasFullContext && !hadFullContext) {
      const entriesToBackfill = get().entries;
      void (async () => {
        // Sequential on purpose: each save already does a serialized DB write —
        // firing them all concurrently would queue thousands of writes at once
        // and stall the DB write queue.
        for (const entry of entriesToBackfill) {
          try {
            await saveOperationLogEntry(projectId as string, pipelineId as string, entry as PersistedLogEntry);
          } catch (error: unknown) {
            logger.warn('operationLog.backfill_failed', {
              projectId,
              pipelineId,
              entryId: entry.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      })();
    }
  },

  append: (entry, chunkUsageBump) => {
    const full: OperationLogEntry = {
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...entry,
    };
    set((state) => ({
      entries: [...state.entries, full],
    }));
    const { currentProjectId, currentPipelineId } = get();
    if (currentProjectId && currentPipelineId) {
      void saveOperationLogEntry(currentProjectId, currentPipelineId, full as PersistedLogEntry, chunkUsageBump).catch(
        (error: unknown) => {
          logger.warn('operationLog.persist_failed', {
            projectId: currentProjectId,
            pipelineId: currentPipelineId,
            entryId: full.id,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
    }
  },

  loadFromDb: async (projectId, pipelineId) => {
    const rows = await loadOperationLogs(projectId, pipelineId);
    set({
      entries: rows as OperationLogEntry[],
      currentProjectId: projectId,
      currentPipelineId: pipelineId,
    });
  },

  clearChunk: (chunkId: string) => {
    set((state) => ({
      entries: state.entries.filter((e) => e.chunkId !== chunkId),
    }));
  },

  clear: () => {
    const { currentProjectId, currentPipelineId } = get();
    set({ entries: [] });
    if (currentProjectId && currentPipelineId) {
      void clearOperationLogs(currentProjectId, currentPipelineId).catch((error: unknown) => {
        logger.warn('operationLog.clear_failed', {
          projectId: currentProjectId,
          pipelineId: currentPipelineId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  },
}));

export function logOperation(
  entry: Omit<OperationLogEntry, 'id' | 'at'>,
  chunkUsageBump?: ChunkUsageBump,
): void {
  useOperationLogStore.getState().append(entry, chunkUsageBump);
}
