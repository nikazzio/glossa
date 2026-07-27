import { useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useUiStore } from '../stores/uiStore';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { countWords } from '../utils';
import type { PipelineRunStatus } from '../types';
import type { ActivePanel, InsightsDrawerTab, ChunkDrawerTab } from '../stores/uiStore';

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
      pipelineName: string | null;
      sourceWords: number;
      targetWords: number;
      coveragePct: number;
      saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
      lastSavedAt: number | null;
      runStatus: PipelineRunStatus;
      completedChunks: number;
      totalChunks: number;
      activePanel: ActivePanel;
      panelSubTab: InsightsDrawerTab | ChunkDrawerTab | null;
    };

export function useStatusBarData(): StatusBarContext {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const location = useUiStore((s) => s.location);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projects = useProjectStore((s) => s.projects);
  const pipelines = useProjectStore((s) => s.pipelines);
  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const saveState = useProjectStore((s) => s.saveState);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const chunks = useChunksStore((s) => s.chunks);
  const runStatus = usePipelineStore((s) => s.runStatus);
  const pipelineConfigId = usePipelineStore((s) => s.config.pipelineId);
  const activePanel = useUiStore((s) => s.activePanel);
  const documentDrawerTab = useUiStore((s) => s.documentDrawerTab);
  const chunkDrawerTab = useUiStore((s) => s.chunkDrawerTab);

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

    const project = projects.find((p) => p.id === currentProjectId);
    const effectivePipelineId = pipelineConfigId || activePipelineId;
    const pipeline = pipelines.find((p) => p.id === effectivePipelineId);

    const { sourceWords, targetWords, completedChunks } = chunks.reduce(
      (acc, c) => ({
        sourceWords: acc.sourceWords + countWords(c.sourceDisplayText),
        targetWords: acc.targetWords + countWords(c.translationDisplayText),
        completedChunks: acc.completedChunks + (c.status === 'completed' ? 1 : 0),
      }),
      { sourceWords: 0, targetWords: 0, completedChunks: 0 }
    );
    const coveragePct = sourceWords > 0 ? Math.round((targetWords / sourceWords) * 100) : 0;
    const totalChunks = chunks.length;

    return {
      kind: 'project',
      projectName: project?.name ?? '',
      pipelineName: pipeline?.name ?? null,
      sourceWords,
      targetWords,
      coveragePct,
      saveState,
      lastSavedAt,
      runStatus,
      completedChunks,
      totalChunks,
      activePanel,
      panelSubTab: activePanel === 'insights' ? documentDrawerTab : activePanel === 'chunk' ? chunkDrawerTab : null,
    };
  }, [
    activeWorkspace,
    location,
    currentProjectId,
    projects,
    pipelines,
    activePipelineId,
    pipelineConfigId,
    saveState,
    lastSavedAt,
    chunks,
    runStatus,
    activePanel,
    documentDrawerTab,
    chunkDrawerTab,
  ]);
}
