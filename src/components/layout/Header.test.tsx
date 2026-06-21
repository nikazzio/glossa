import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useChunksStore } from '../../stores/chunksStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const originalCloseProject = useProjectStore.getState().closeProject;

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useProjectStore.setState({
      currentProjectId: null,
      projects: [],
      closeProject: originalCloseProject,
    });
    useWorkspaceStore.setState({
      activeWorkspace: null,
      workspaces: [],
    });
    useChunksStore.setState({
      isProcessing: false,
    });
  });

  it('renders the project breadcrumb and returns to the workspace dashboard', () => {
    const closeProject = vi.fn();
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'workspace-1', name: 'Scholars' } as never,
      workspaces: [{ id: 'workspace-1', name: 'Scholars' } as never],
    });
    useProjectStore.setState({
      currentProjectId: 'project-1',
      projects: [{ id: 'project-1', name: 'Draft' } as never],
      closeProject,
    });

    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: 'Scholars' }));

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(closeProject).toHaveBeenCalledTimes(1);
  });
});
