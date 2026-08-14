import { useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useUiStore } from '../stores/uiStore';
import { useChunksStore } from '../stores/chunksStore';

/**
 * Quello che la barra di stato mostra, ricavato dagli store.
 *
 * Contiene **solo** ciò che la barra disegna davvero: conteggi di parole,
 * copertura e stato della pipeline erano rimasti qui dopo che la barra ha
 * smesso di mostrarli, e ricalcolavano le parole di ogni frammento a ogni
 * render per un numero che nessuno leggeva.
 */
export type StatusBarContext =
  | { kind: 'idle' }
  | {
      kind: 'workspace';
      workspaceName: string;
      projectCount: number;
      areaName: string;
    }
  | {
      kind: 'project';
      projectName: string;
      saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
      lastSavedAt: number | null;
      totalChunks: number;
    };

export function useStatusBarData(): StatusBarContext {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const location = useUiStore((s) => s.location);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projects = useProjectStore((s) => s.projects);
  const saveState = useProjectStore((s) => s.saveState);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const totalChunks = useChunksStore((s) => s.chunks.length);

  return useMemo<StatusBarContext>(() => {
    if (!activeWorkspace) return { kind: 'idle' };

    if (!currentProjectId) {
      return {
        kind: 'workspace',
        workspaceName: activeWorkspace.name,
        projectCount: projects.length,
        areaName: location.area,
      };
    }

    return {
      kind: 'project',
      projectName: projects.find((p) => p.id === currentProjectId)?.name ?? '',
      saveState,
      lastSavedAt,
      totalChunks,
    };
  }, [
    activeWorkspace,
    location,
    currentProjectId,
    projects,
    saveState,
    lastSavedAt,
    totalChunks,
  ]);
}
