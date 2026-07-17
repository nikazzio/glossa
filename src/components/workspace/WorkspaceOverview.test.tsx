import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceOverview } from './WorkspaceOverview';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const originalProjectState = useProjectStore.getState();
const originalWorkspaceState = useWorkspaceStore.getState();

describe('WorkspaceOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      ...originalProjectState,
      projects: [],
      loadProjects: vi.fn().mockResolvedValue(undefined),
      openProject: vi.fn().mockResolvedValue(undefined),
    });
    useWorkspaceStore.setState({
      ...originalWorkspaceState,
      activeWorkspace: { id: 'ws-1', name: 'Scherma', description: 'Trattati storici' } as never,
      workspaces: [{ id: 'ws-1', name: 'Scherma' }] as never,
      removeWorkspace: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('shows workspace identity with icon-only actions', () => {
    render(<WorkspaceOverview />);

    expect(screen.getByRole('heading', { level: 1, name: 'Scherma' })).toBeInTheDocument();
    expect(screen.getByText('Trattati storici')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'library.openLibrary' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'workspace.configure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'workspace.delete' })).toBeInTheDocument();
  });

  it('lists the workspace projects and opens one on click', async () => {
    useProjectStore.setState({
      projects: [
        { id: 'p1', name: 'Fiore dei Liberi', updated_at: '2026-07-15T10:00:00.000Z', pipeline_count: 2 },
      ],
    } as never, false);

    render(<WorkspaceOverview />);
    await userEvent.click(screen.getByRole('button', { name: /Fiore dei Liberi/ }));

    expect(useProjectStore.getState().openProject).toHaveBeenCalledWith('p1');
  });

  it('offers project creation as an icon-only action', () => {
    render(<WorkspaceOverview />);

    const createButton = screen.getByRole('button', { name: 'workspace.newBookCard' });
    expect(createButton.textContent ?? '').not.toMatch(/workspace\.newBookCard/);
  });
});
