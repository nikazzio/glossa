import { useMemo } from 'react';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useUiStore } from '../stores/uiStore';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { countWords } from '../utils';
import type { PipelineRunStatus } from '../types';

export type StatusBarContext =
  | { kind: 'idle' }
  | {
      kind: 'workspace';
      workspaceName: string;
      projectCount: number;
      areaName: string | null;
    }
  | {
      kind: 'project';
      projectName: string;
      pipelineName: string | null;
      sourceWords: number;
      targetWords: number;
      coverageRatio: number;
      saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
      runStatus: PipelineRunStatus;
      completedChunks: number;
      totalChunks: number;
    };

export function useStatusBarData(): StatusBarContext {
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);
  const activeWorkspaceArea = useUiStore((s) => s.activeWorkspaceArea);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const projects = useProjectStore((s) => s.projects);
  const pipelines = useProjectStore((s) => s.pipelines);
  const activePipelineId = useProjectStore((s) => s.activePipelineId);
  const saveState = useProjectStore((s) => s.saveState);
  const chunks = useChunksStore((s) => s.chunks);
  const runStatus = usePipelineStore((s) => s.runStatus);
  const pipelineConfigId = usePipelineStore((s) => s.config.pipelineId);

  return useMemo<StatusBarContext>(() => {
    if (!activeWorkspace) return { kind: 'idle' };

    if (!currentProjectId) {
      return {
        kind: 'workspace',
        workspaceName: activeWorkspace.name,
        projectCount: projects.length,
        areaName: activeWorkspaceArea,
      };
    }

    const project = projects.find((p) => p.id === currentProjectId);
    const effectivePipelineId = pipelineConfigId || activePipelineId;
    const pipeline = pipelines.find((p) => p.id === effectivePipelineId);

    const sourceWords = chunks.reduce((acc, c) => acc + countWords(c.originalText ?? ''), 0);
    const targetWords = chunks.reduce((acc, c) => acc + countWords(c.currentDraft ?? ''), 0);
    const coverageRatio = sourceWords > 0 ? Math.round((targetWords / sourceWords) * 100) : 0;
    const completedChunks = chunks.filter((c) => c.status === 'completed').length;
    const totalChunks = chunks.length;

    return {
      kind: 'project',
      projectName: project?.name ?? '',
      pipelineName: pipeline?.name ?? null,
      sourceWords,
      targetWords,
      coverageRatio,
      saveState,
      runStatus,
      completedChunks,
      totalChunks,
    };
  }, [
    activeWorkspace,
    activeWorkspaceArea,
    currentProjectId,
    projects,
    pipelines,
    activePipelineId,
    pipelineConfigId,
    saveState,
    chunks,
    runStatus,
  ]);
}
