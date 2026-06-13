import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { DashboardSidebar } from './DashboardSidebar';

const originalProjectState = useProjectStore.getState();
const originalWorkspaceState = useWorkspaceStore.getState();

describe('DashboardSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      ...originalProjectState,
      closeProject: vi.fn(),
      loadProjects: vi.fn().mockResolvedValue(undefined),
    });
    useWorkspaceStore.setState({
      ...originalWorkspaceState,
      activeWorkspace: { id: 'workspace-1', name: 'Editorial' } as never,
      workspaces: [
        { id: 'workspace-1', name: 'Editorial' } as never,
        { id: 'workspace-2', name: 'Archive' } as never,
      ],
      createAndActivate: vi.fn().mockResolvedValue({ id: 'workspace-3', name: 'New' }),
      setActive: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('shows translations as the only enabled macroarea', () => {
    render(<DashboardSidebar />);

    expect(screen.getByRole('button', { name: /workspace\.areas\.translations\.title/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /workspace\.areas\.library\.title/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /workspace\.areas\.transcriptions\.title/ })).toBeDisabled();
  });

  it('exposes configure and delete actions on the active workspace row', () => {
    render(<DashboardSidebar />);

    expect(screen.getByRole('button', { name: 'workspace.configure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'workspace.delete' })).toBeInTheDocument();
  });

  it('creates a workspace with the default embedding model from the quick form', async () => {
    const createAndActivate = vi.fn().mockResolvedValue({ id: 'workspace-3', name: 'New' });
    useWorkspaceStore.setState({ createAndActivate });

    render(<DashboardSidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'workspace.create' }));
    expect(screen.queryByText('workspace.embeddingModel')).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('workspace.namePlaceholder'), {
      target: { value: 'New workspace' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    await waitFor(() => {
      expect(createAndActivate).toHaveBeenCalledWith({
        name: 'New workspace',
        description: undefined,
        embeddingModel: 'text-embedding-3-small',
      });
    });
  });
});
