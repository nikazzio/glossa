import { useCallback, useEffect, useRef, useState } from 'react';
import { useChunksStore } from '../stores/chunksStore';
import { llmService } from '../services/llmService';

const WATCHDOG_INTERVAL_MS = 5_000;
const STUCK_THRESHOLD_MS = 60_000;

/**
 * Detects translation chunks that have been in "processing" state for longer
 * than STUCK_THRESHOLD_MS (default 60 s) without any activity (status change
 * or new stage result).
 *
 * Returns:
 *  - stuckChunkIds: Set of chunk IDs currently considered stuck
 *  - cancelStuckChunk: cancels the active stream, resets the chunk to "ready"
 */
export function useChunkWatchdog() {
  const processingStartTimes = useRef<Map<string, number>>(new Map());
  const [stuckChunkIds, setStuckChunkIds] = useState<Set<string>>(new Set());

  // Seed processingStartTimes from chunks already processing on mount
  useEffect(() => {
    const now = Date.now();
    const { chunks } = useChunksStore.getState();
    for (const c of chunks) {
      if (c.status === 'processing') {
        processingStartTimes.current.set(c.id, now);
      }
    }
  }, []);

  // Track entry/exit of "processing" state, and refresh last-activity time
  // whenever a stage result changes (token received) so we don't flag active streams.
  useEffect(() => {
    const unsubscribe = useChunksStore.subscribe((state) => {
      const now = Date.now();
      const processingIds = new Set(
        state.chunks.filter((c) => c.status === 'processing').map((c) => c.id),
      );

      for (const id of processingIds) {
        if (!processingStartTimes.current.has(id)) {
          // Chunk just entered processing state
          processingStartTimes.current.set(id, now);
        } else {
          // Refresh activity time when stage results change (new token/output received)
          const chunk = state.chunks.find((c) => c.id === id);
          if (chunk && Object.keys(chunk.stageResults).length > 0) {
            processingStartTimes.current.set(id, now);
          }
        }
      }

      for (const [id] of processingStartTimes.current) {
        if (!processingIds.has(id)) {
          processingStartTimes.current.delete(id);
        }
      }
    });

    return unsubscribe;
  }, []);

  // Periodically check for chunks stuck beyond the threshold.
  // Only flag chunks that are actively streaming (have an activeStreamId).
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const { activeStreamId } = useChunksStore.getState();
      const stuck = new Set<string>();

      if (activeStreamId) {
        for (const [id, startTime] of processingStartTimes.current) {
          if (now - startTime > STUCK_THRESHOLD_MS) {
            stuck.add(id);
          }
        }
      }

      setStuckChunkIds((prev) => {
        if (stuck.size === prev.size && [...stuck].every((id) => prev.has(id))) return prev;
        return stuck;
      });
    }, WATCHDOG_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  const cancelStuckChunk = useCallback((chunkId: string) => {
    const store = useChunksStore.getState();
    if (store.activeStreamId) {
      llmService.cancelStream(store.activeStreamId).catch(() => {});
    }
    store.updateChunkStatus(chunkId, 'ready');
    store.clearChunkStages(chunkId);

    processingStartTimes.current.delete(chunkId);
    setStuckChunkIds((prev) => {
      const next = new Set(prev);
      next.delete(chunkId);
      return next;
    });
  }, []);

  return { stuckChunkIds, cancelStuckChunk };
}
