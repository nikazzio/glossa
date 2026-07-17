import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDashboard } from './AppDashboard';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';

vi.mock('../../hooks/useProviderKeyStatus', () => ({
  useProviderKeyStatus: () => ({
    statuses: { openai: true, anthropic: false },
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

const mockListRecent = vi.fn();
const mockListRuns = vi.fn();
const mockCounts = vi.fn();
vi.mock('../../services/projectService', () => ({
  listRecentProjectsAllWorkspaces: (...args: unknown[]) => mockListRecent(...args),
  listRecentPipelineRuns: (...args: unknown[]) => mockListRuns(...args),
  countProjectsByWorkspace: (...args: unknown[]) => mockCounts(...args),
}));

const originalProjectState = useProjectStore.getState();
const originalWorkspaceState = useWorkspaceStore.getState();

const WS_ALPHA = { id: 'ws-1', name: 'Alpha' };
const WS_BETA = { id: 'ws-2', name: 'Beta' };

describe('AppDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ activeWorkspaceView: 'dashboard' });
    mockListRecent.mockResolvedValue([]);
    mockListRuns.mockResolvedValue([]);
    mockCounts.mockResolvedValue([]);
    useProjectStore.setState({
      ...originalProjectState,
      openProject: vi.fn().mockResolvedValue(undefined),
      loadProjects: vi.fn().mockResolvedValue(undefined),
      closeProject: vi.fn(),
    });
    useWorkspaceStore.setState({
      ...originalWorkspaceState,
      workspaces: [WS_ALPHA, WS_BETA] as never,
      activeWorkspace: WS_ALPHA as never,
      setActive: vi.fn().mockResolvedValue(undefined),
      removeWorkspace: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('shows recent projects across workspaces with their workspace badge', async () => {
    mockListRecent.mockResolvedValue([
      { id: 'p1', name: 'Fiore dei Liberi', updated_at: '2026-07-15T10:00:00.000Z', workspace_id: 'ws-2', workspace_name: 'Beta' },
    ]);

    render(<AppDashboard />);

    const projectRow = (await screen.findByText('Fiore dei Liberi')).closest('button');
    expect(projectRow).not.toBeNull();
    expect(within(projectRow as HTMLElement).getByText('Beta')).toBeInTheDocument();
  });

  it('resuming a project from another workspace activates that workspace first', async () => {
    mockListRecent.mockResolvedValue([
      { id: 'p1', name: 'Fiore dei Liberi', updated_at: '2026-07-15T10:00:00.000Z', workspace_id: 'ws-2', workspace_name: 'Beta' },
    ]);

    render(<AppDashboard />);
    await userEvent.click(await screen.findByText('Fiore dei Liberi'));

    await waitFor(() => {
      expect(useWorkspaceStore.getState().setActive).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ws-2' }),
      );
      expect(useProjectStore.getState().openProject).toHaveBeenCalledWith('p1');
    });
  });

  it('resuming a project of the active workspace opens it without switching', async () => {
    mockListRecent.mockResolvedValue([
      { id: 'p9', name: 'Vadi', updated_at: '2026-07-15T10:00:00.000Z', workspace_id: 'ws-1', workspace_name: 'Alpha' },
    ]);

    render(<AppDashboard />);
    await userEvent.click(await screen.findByText('Vadi'));

    await waitFor(() => {
      expect(useProjectStore.getState().openProject).toHaveBeenCalledWith('p9');
    });
    expect(useWorkspaceStore.getState().setActive).not.toHaveBeenCalled();
  });

  it('shows empty states for resume and activity when there is no data', async () => {
    render(<AppDashboard />);

    expect(await screen.findByText('dashboard.resumeEmpty')).toBeInTheDocument();
    expect(screen.getByText('dashboard.activityEmpty')).toBeInTheDocument();
  });

  it('shows recent pipeline runs with their outcome', async () => {
    mockListRuns.mockResolvedValue([
      { at: '2026-07-15T10:00:00.000Z', level: 'success', project_id: 'p1', project_name: 'Fiore dei Liberi', workspace_id: 'ws-1', workspace_name: 'Alpha' },
    ]);

    render(<AppDashboard />);

    expect(await screen.findByText('dashboard.runOutcome.success')).toBeInTheDocument();
  });

  it('clicking a workspace row activates it and navigates to its page', async () => {
    mockCounts.mockResolvedValue([
      { workspace_id: 'ws-1', project_count: 3, last_updated_at: '2026-07-15T10:00:00.000Z' },
      { workspace_id: 'ws-2', project_count: 1, last_updated_at: null },
    ]);

    render(<AppDashboard />);

    const betaRow = await screen.findByRole('button', { name: /Beta/ });
    await userEvent.click(betaRow);

    await waitFor(() => {
      expect(useWorkspaceStore.getState().setActive).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ws-2' }),
      );
      expect(useUiStore.getState().activeWorkspaceView).toBe('workspace');
    });
  });

  it('clicking the active workspace row navigates to its page without re-activating', async () => {
    render(<AppDashboard />);

    const alphaRow = await screen.findByRole('button', { name: /Alpha/ });
    await userEvent.click(alphaRow);

    await waitFor(() => {
      expect(useUiStore.getState().activeWorkspaceView).toBe('workspace');
    });
    expect(useWorkspaceStore.getState().setActive).not.toHaveBeenCalled();
  });

  it('offers workspace creation as an icon-only action', async () => {
    render(<AppDashboard />);

    await screen.findByText('dashboard.resumeEmpty');
    const createButton = screen.getByRole('button', { name: 'workspace.create' });
    expect(createButton.textContent ?? '').not.toMatch(/workspace\.create/);
  });
});
