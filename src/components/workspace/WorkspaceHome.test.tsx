import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceHome } from './WorkspaceHome';

vi.mock('../../hooks/useProviderKeyStatus', () => ({
  useProviderKeyStatus: () => ({
    statuses: {
      gemini: false,
      openai: false,
      anthropic: false,
      deepseek: false,
    },
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

const initialUiState = useUiStore.getState();
const originalProjectState = useProjectStore.getState();
const originalWorkspaceState = useWorkspaceStore.getState();

describe('WorkspaceHome provider onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState(initialUiState, true);
    useProjectStore.setState({
      ...originalProjectState,
      projects: [],
      loadProjects: vi.fn().mockResolvedValue(undefined),
      createAndOpen: vi.fn().mockResolvedValue(undefined),
      openProject: vi.fn().mockResolvedValue(undefined),
      removeProject: vi.fn().mockResolvedValue(undefined),
    });
    useWorkspaceStore.setState({
      ...originalWorkspaceState,
      activeWorkspace: {
        id: 'workspace-1',
        name: 'Editorial',
        description: undefined,
        embeddingModel: 'text-embedding-3-small',
        memoryExtractorProvider: 'openai',
        memoryExtractorModel: 'gpt-5-nano',
        memoryExtractorPrompt: '',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
      workspaces: [
        {
          id: 'workspace-1',
          name: 'Editorial',
          description: undefined,
          embeddingModel: 'text-embedding-3-small',
          memoryExtractorProvider: 'openai',
          memoryExtractorModel: 'gpt-5-nano',
          memoryExtractorPrompt: '',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ],
      removeWorkspace: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('opens Settings on the provider tab from the onboarding banner', () => {
    render(<WorkspaceHome />);

    fireEvent.click(screen.getByRole('button', { name: 'workspace.providerBannerCta' }));

    const state = useUiStore.getState();
    expect(state.showSettings).toBe(true);
    expect(state.settingsTab).toBe('provider');
  });

  it('exposes configure and delete actions on the workspace header', () => {
    render(<WorkspaceHome />);

    expect(screen.getByRole('button', { name: 'workspace.configure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'workspace.delete' })).toBeInTheDocument();
  });

  it('clicking Translations area card calls setActiveWorkspaceView("translations")', async () => {
    const mockSetView = vi.fn();
    useUiStore.setState({ setActiveWorkspaceView: mockSetView }, false);

    render(<WorkspaceHome />);
    const translationsCard = screen.getByRole('button', { name: /workspace\.areas\.translations\.title/ });
    await userEvent.click(translationsCard);
    expect(mockSetView).toHaveBeenCalledWith('translations');
  });

  it('shows the resume section with the most recent projects when projects exist', () => {
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'Alpha', updated_at: '2026-07-01T10:00:00.000Z', pipeline_count: 1 },
        { id: 'p2', name: 'Beta', updated_at: '2026-07-15T10:00:00.000Z', pipeline_count: 2 },
        { id: 'p3', name: 'Gamma', updated_at: '2026-07-10T10:00:00.000Z', pipeline_count: 0 },
        { id: 'p4', name: 'Delta', updated_at: '2026-06-01T10:00:00.000Z', pipeline_count: 0 },
      ],
    } as never, false);

    render(<WorkspaceHome />);

    expect(screen.getByText('workspace.resumeTitle')).toBeInTheDocument();
    // Solo i 3 più recenti, ordinati per data: Beta, Gamma, Alpha (Delta escluso).
    expect(screen.getByRole('button', { name: /Beta/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gamma/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delta/ })).not.toBeInTheDocument();
  });

  it('hides the resume section when the workspace has no projects', () => {
    render(<WorkspaceHome />);
    expect(screen.queryByText('workspace.resumeTitle')).not.toBeInTheDocument();
  });

  it('opens a project when clicking a resume row', async () => {
    const mockOpen = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({
      projects: [{ id: 'p1', name: 'Alpha', updated_at: '2026-07-01T10:00:00.000Z', pipeline_count: 1 }],
      openProject: mockOpen,
    } as never, false);

    render(<WorkspaceHome />);
    await userEvent.click(screen.getByRole('button', { name: /Alpha/ }));
    expect(mockOpen).toHaveBeenCalledWith('p1');
  });
});
