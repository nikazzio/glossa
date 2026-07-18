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
const mockListAttention = vi.fn();
const mockOverviewStats = vi.fn();
vi.mock('../../services/projectService', () => ({
  listRecentProjectsAllWorkspaces: (...args: unknown[]) => mockListRecent(...args),
  listRecentPipelineRuns: (...args: unknown[]) => mockListRuns(...args),
  listProjectsNeedingAttention: (...args: unknown[]) => mockListAttention(...args),
  getDashboardOverviewStats: () => mockOverviewStats(),
}));

const mockCountGlossaryEntries = vi.fn();
vi.mock('../../services/glossaryService', () => ({
  countGlossaryEntries: () => mockCountGlossaryEntries(),
}));

const mockCountPhraseMemoryEntries = vi.fn();
vi.mock('../../services/phraseMemoryService', () => ({
  countPhraseMemoryEntries: () => mockCountPhraseMemoryEntries(),
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
    mockListAttention.mockResolvedValue([]);
    mockOverviewStats.mockResolvedValue({ totalProjects: 0, totalChunks: 0, completedChunks: 0 });
    mockCountGlossaryEntries.mockResolvedValue(0);
    mockCountPhraseMemoryEntries.mockResolvedValue(0);
    useProjectStore.setState({
      ...originalProjectState,
      openProjectInWorkspace: vi.fn().mockResolvedValue(undefined),
    });
    useWorkspaceStore.setState({
      ...originalWorkspaceState,
      workspaces: [WS_ALPHA, WS_BETA] as never,
      activeWorkspace: WS_ALPHA as never,
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

  it('resuming a project delegates to the store with its id and workspace', async () => {
    mockListRecent.mockResolvedValue([
      { id: 'p1', name: 'Fiore dei Liberi', updated_at: '2026-07-15T10:00:00.000Z', workspace_id: 'ws-2', workspace_name: 'Beta' },
    ]);

    render(<AppDashboard />);
    await userEvent.click(await screen.findByText('Fiore dei Liberi'));

    await waitFor(() => {
      expect(useProjectStore.getState().openProjectInWorkspace).toHaveBeenCalledWith('p1', 'ws-2');
    });
  });

  it('shows empty states for resume, activity and attention when there is no data', async () => {
    render(<AppDashboard />);

    expect(await screen.findByText('dashboard.resumeEmpty')).toBeInTheDocument();
    expect(screen.getByText('dashboard.activityEmpty')).toBeInTheDocument();
    expect(screen.getByText('dashboard.attentionEmpty')).toBeInTheDocument();
  });

  it('shows recent pipeline runs with their outcome', async () => {
    mockListRuns.mockResolvedValue([
      { at: '2026-07-15T10:00:00.000Z', level: 'success', project_id: 'p1', project_name: 'Fiore dei Liberi', workspace_id: 'ws-1', workspace_name: 'Alpha' },
    ]);

    render(<AppDashboard />);

    expect(await screen.findByText('dashboard.runOutcome.success')).toBeInTheDocument();
  });

  it('shows the overview tiles with real aggregate numbers', async () => {
    mockOverviewStats.mockResolvedValue({ totalProjects: 12, totalChunks: 300, completedChunks: 210 });
    mockCountPhraseMemoryEntries.mockResolvedValue(48);
    mockCountGlossaryEntries.mockResolvedValue(120);

    render(<AppDashboard />);

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('dashboard.stats.chunksValue')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('shows projects needing attention and opens one on click', async () => {
    mockListAttention.mockResolvedValue([
      { project_id: 'p1', project_name: 'Fiore dei Liberi', workspace_id: 'ws-2', workspace_name: 'Beta', issue_count: 3 },
    ]);

    render(<AppDashboard />);

    const row = (await screen.findByText('Fiore dei Liberi')).closest('button');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Beta')).toBeInTheDocument();

    await userEvent.click(row as HTMLElement);

    await waitFor(() => {
      expect(useProjectStore.getState().openProjectInWorkspace).toHaveBeenCalledWith('p1', 'ws-2');
    });
  });
});
