import { useEffect, useMemo, useRef } from 'react';
import { usePipelineStore } from '../stores/pipelineStore';
import { useChunksStore } from '../stores/chunksStore';
import { useProjectStore } from '../stores/projectStore';
import { useUiStore } from '../stores/uiStore';
import { buildProjectSnapshot } from '../utils/projectSnapshot';

export { buildProjectSnapshot };

export function useProjectSnapshot(): string {
  const inputText = usePipelineStore((state) => state.inputText);
  const config = usePipelineStore((state) => state.config);
  const chunks = useChunksStore((state) => state.chunks);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const viewMode = useUiStore((state) => state.viewMode);
  const lastStableSnapshotRef = useRef<string | null>(null);

  return useMemo(() => {
    if (isProcessing && lastStableSnapshotRef.current !== null) {
      return lastStableSnapshotRef.current;
    }
    const next = buildProjectSnapshot({ inputText, config, chunks, viewMode });
    lastStableSnapshotRef.current = next;
    return next;
  }, [chunks, config, inputText, isProcessing, viewMode]);
}

export function useProjectAutosave(delayMs = 1200) {
  const currentProjectId = useProjectStore((state) => state.currentProjectId);
  const saveState = useProjectStore((state) => state.saveState);
  const trackedSnapshot = useProjectStore((state) => state.trackedSnapshot);
  const isProcessing = useChunksStore((state) => state.isProcessing);
  const snapshot = useProjectSnapshot();
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
      void useProjectStore.getState().saveCurrentProject(snapshot).catch(() => {});
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [currentProjectId, delayMs, isProcessing, saveState, snapshot]);
}
