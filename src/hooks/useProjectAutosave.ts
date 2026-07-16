import { useEffect, useMemo, useRef } from 'react';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { useProjectStore } from '../stores/projectStore';
import { useUiStore } from '../stores/uiStore';
import { buildProjectSnapshot } from '../utils/projectSnapshot';
import { logger } from '../utils/logger';

export { buildProjectSnapshot };

export function useProjectSnapshot(enabled = true): string {
  const inputText = usePipelineStore((state) => state.inputText);
  const inputProcessingText = usePipelineStore((state) => state.inputProcessingText);
  const sourceFootnotes = usePipelineStore((state) => state.sourceFootnotes);
  const config = usePipelineStore((state) => state.config);
  const chunks = useChunksStore((state) => state.chunks);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const viewMode = useUiStore((state) => state.viewMode);
  const lastStableSnapshotRef = useRef<string | null>(null);

  return useMemo(() => {
    if (!enabled) {
      lastStableSnapshotRef.current = null;
      return '';
    }
    if (isProcessing && lastStableSnapshotRef.current !== null) {
      return lastStableSnapshotRef.current;
    }
    const next = buildProjectSnapshot({
      inputText,
      inputProcessingText,
      sourceFootnotes,
      config,
      chunks,
      viewMode,
    });
    lastStableSnapshotRef.current = next;
    return next;
  }, [chunks, config, enabled, inputProcessingText, inputText, isProcessing, sourceFootnotes, viewMode]);
}

export function useProjectAutosave(delayMs = 1200) {
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const saveState = useProjectStore((state) => state.saveState);
  const trackedSnapshot = useProjectStore((state) => state.trackedSnapshot);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const snapshot = useProjectSnapshot(Boolean(currentProjectId));
  const initializedProjectId = useRef<string | null>(null);

  useEffect(() => {
    if (!currentProjectId) {
      initializedProjectId.current = null;
      if (
        useProjectStore.getState().saveState !== 'idle' ||
        useProjectStore.getState().trackedSnapshot !== null
      ) {
        useProjectStore.setState({
          saveState: 'idle',
          lastSaveError: null,
          trackedSnapshot: null,
        });
      }
      return;
    }

    if (saveState === 'saving') return;

    if (initializedProjectId.current !== currentProjectId || trackedSnapshot === null) {
      initializedProjectId.current = currentProjectId;
      useProjectStore.setState({
        saveState: 'saved',
        lastSaveError: null,
        trackedSnapshot: snapshot,
      });
      return;
    }

    if (snapshot !== trackedSnapshot) {
      if (saveState !== 'dirty') {
        useProjectStore.setState({ saveState: 'dirty' });
      }
      return;
    }

    if (saveState !== 'saved') {
      useProjectStore.setState({ saveState: 'saved', lastSaveError: null });
    }
  }, [currentProjectId, saveState, snapshot, trackedSnapshot]);

  useEffect(() => {
    if (!currentProjectId || isProcessing || saveState !== 'dirty') return;

    const timer = window.setTimeout(() => {
      if (useProjectStore.getState().saveState === 'saving') return;
      const chunks = useChunksStore.getState().chunks;
      logger.debug('autosave: triggered', {
        projectId: currentProjectId,
        chunksCount: chunks.length,
      });
      void useProjectStore.getState().saveCurrentProject().catch((error: unknown) => {
        logger.warn('autosave: saveCurrentProject failed', {
          projectId: currentProjectId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [currentProjectId, delayMs, isProcessing, saveState, snapshot]);
}
