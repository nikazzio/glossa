import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStatusBarData } from './useStatusBarData';
import { useProjectStore } from '../stores/projectStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useUiStore } from '../stores/uiStore';
import { useChunksStore } from '../stores/chunksStore';
import { usePipelineStore } from '../stores/pipelineStore';

describe('useStatusBarData', () => {
  beforeEach(() => {
    useProjectStore.setState({ currentProjectId: null, projects: [], pipelines: [], activePipelineId: null, saveState: 'idle' } as any);
    useWorkspaceStore.setState({ activeWorkspace: null } as any);
    useUiStore.setState({ location: { area: 'dashboard' } });
    useChunksStore.setState({ chunks: [] } as any);
    usePipelineStore.setState((s) => ({ runStatus: 'idle', config: { ...s.config, pipelineId: '' } }));
  });

  it('returns idle when no workspace', () => {
    const { result } = renderHook(() => useStatusBarData());
    expect(result.current.kind).toBe('idle');
  });

  it('returns workspace context when workspace active, no project open', () => {
    useWorkspaceStore.setState({ activeWorkspace: { id: 'ws1', name: 'My WS' } } as any);
    useProjectStore.setState({ projects: [{ id: 'p1' }, { id: 'p2' }], currentProjectId: null } as any);
    const { result } = renderHook(() => useStatusBarData());
    expect(result.current).toMatchObject({ kind: 'workspace', workspaceName: 'My WS', projectCount: 2 });
  });

  it('returns project context when project is open', () => {
    useWorkspaceStore.setState({ activeWorkspace: { id: 'ws1', name: 'My WS' } } as any);
    useProjectStore.setState({
      currentProjectId: 'p1',
      projects: [{ id: 'p1', name: 'Progetto A' }],
      pipelines: [{ id: 'pipe1', name: 'Pipeline A' }],
      activePipelineId: 'pipe1',
      saveState: 'saved',
    } as any);
    useChunksStore.setState({
      chunks: [
        { status: 'completed', sourceDisplayText: 'hello world', translationDisplayText: 'ciao mondo' },
        { status: 'ready', sourceDisplayText: 'foo bar', translationDisplayText: '' },
      ],
    } as any);
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
