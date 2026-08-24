import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStatusBarData } from './useStatusBarData';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useUiStore } from '../stores/uiStore';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';
import { makeTranslationChunk } from '../test/chunkFactory';
import type { Pipeline, Workspace } from '../types';
import type { Project } from '../services/projectService';

const workspace: Workspace = {
  id: 'ws1',
  name: 'My WS',
  iconKey: 'book',
  embeddingModel: 'text-embedding-3-small',
  memoryExtractorProvider: 'openai',
  memoryExtractorModel: 'model',
  memoryExtractorPrompt: 'prompt',
  createdAt: '2026-08-22',
};

const project: Project = {
  id: 'p1',
  name: 'Progetto A',
  workspace_id: 'ws1',
  source_language: 'it',
  target_language: 'en',
  created_at: '2026-08-22',
  updated_at: '2026-08-22',
  pipeline_count: 1,
  pipeline_names: 'Pipeline A',
};

const pipeline: Pipeline = {
  id: 'pipe1',
  projectId: 'p1',
  name: 'Pipeline A',
  sourceLanguage: 'it',
  targetLanguage: 'en',
  mode: 'standard',
  runStatus: 'idle',
  lastRunConfig: null,
  createdAt: '2026-08-22',
  updatedAt: '2026-08-22',
};

describe('useStatusBarData', () => {
  beforeEach(() => {
    useProjectStore.setState({ currentProjectId: null, projects: [], pipelines: [], activePipelineId: null, saveState: 'idle' });
    useWorkspaceStore.setState({ activeWorkspace: null });
    useUiStore.setState({ location: { area: 'dashboard' } });
    useChunksStore.setState({ chunks: [] });
    usePipelineStore.setState((s) => ({ runStatus: 'idle', config: { ...s.config, pipelineId: '' } }));
  });

  it('returns idle when no workspace', () => {
    const { result } = renderHook(() => useStatusBarData());
    expect(result.current.kind).toBe('idle');
  });

  it('returns workspace context when workspace active, no project open', () => {
    useWorkspaceStore.setState({ activeWorkspace: workspace });
    useProjectStore.setState({ projects: [project, { ...project, id: 'p2' }], currentProjectId: null });
    const { result } = renderHook(() => useStatusBarData());
    expect(result.current).toMatchObject({ kind: 'workspace', workspaceName: 'My WS', projectCount: 2 });
  });

  it('returns project context when project is open', () => {
    useWorkspaceStore.setState({ activeWorkspace: workspace });
    useProjectStore.setState({
      currentProjectId: 'p1',
      projects: [project],
      pipelines: [pipeline],
      activePipelineId: 'pipe1',
      saveState: 'saved',
    });
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({
          id: 'c1',
          status: 'completed',
          sourceDisplayText: 'hello world',
          translationDisplayText: 'ciao mondo',
        }),
        makeTranslationChunk({
          id: 'c2',
          status: 'ready',
          sourceDisplayText: 'foo bar',
          translationDisplayText: '',
        }),
      ],
    });
    usePipelineStore.setState((s) => ({ runStatus: 'idle', config: { ...s.config, pipelineId: 'pipe1' } }));
    const { result } = renderHook(() => useStatusBarData());
    expect(result.current.kind).toBe('project');
    if (result.current.kind === 'project') {
      expect(result.current.projectName).toBe('Progetto A');
      expect(result.current.totalChunks).toBe(2);
      expect(result.current.saveState).toBe('saved');
    }
  });
});
