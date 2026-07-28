import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../../stores/projectStore';
import { useUiStore } from '../../../stores/uiStore';
import { useWorkspaceStore } from '../../../stores/workspaceStore';
import { WorkspaceShellNext } from './WorkspaceShellNext';

const initialUiState = useUiStore.getState();
const initialWorkspaceState = useWorkspaceStore.getState();

function renderShell() {
  return render(
    <WorkspaceShellNext>
      <div>workspace-content</div>
    </WorkspaceShellNext>,
  );
}

describe('WorkspaceShellNext (#294)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState(initialUiState, true);
    useWorkspaceStore.setState(initialWorkspaceState, true);
    useProjectStore.setState({ closeProject: vi.fn(), loadProjects: vi.fn() });
    useWorkspaceStore.setState({
      workspaces: [
        { id: 'ws-1', name: 'Alpha' } as never,
        { id: 'ws-2', name: 'Beta' } as never,
      ],
      activeWorkspace: { id: 'ws-1', name: 'Alpha' } as never,
      setActive: vi.fn(),
    });
  });

  it('renders the rail and the content without crashing', () => {
    renderShell();

    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('workspace-content')).toBeInTheDocument();
  });

  it('collapses and expands the rail via the explicit toggle button', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.collapse' }));
    expect(useUiStore.getState().dashboardSidebarCollapsed).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.expand' }));
    expect(useUiStore.getState().dashboardSidebarCollapsed).toBe(false);
  });

  it('clicking a workspace in the rail activates it and navigates to its page', () => {
    renderShell();

    fireEvent.click(screen.getByText('Beta'));

    expect(useWorkspaceStore.getState().setActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ws-2' }),
    );
  });

  it('clicking the active workspace navigates to its page without re-activating', () => {
    renderShell();

    fireEvent.click(screen.getByText('Alpha'));

    expect(useUiStore.getState().location).toEqual({ area: 'workspace', workspaceId: 'ws-1' });
    expect(useWorkspaceStore.getState().setActive).not.toHaveBeenCalled();
  });

  it('shows Dashboard, every area and workspace icons when the rail is collapsed', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.collapse' }));
    expect(screen.getByRole('button', { name: /Beta/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dashboard\.title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /areas\.translations\.title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /areas\.library\.title/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /areas\.transcriptions\.title/ })).not.toBeDisabled();
  });

  it('selects the translations area and keeps it selected on a second click (radio, no toggle)', () => {
    renderShell();

    fireEvent.click(screen.getByText('areas.translations.title'));
    expect(useUiStore.getState().location).toEqual({ area: 'translations' });

    fireEvent.click(screen.getByText('areas.translations.title'));
    expect(useUiStore.getState().location).toEqual({ area: 'translations' });
  });

  it('returns to the dashboard from the standalone dashboard nav item', () => {
    renderShell();

    fireEvent.click(screen.getByText('areas.translations.title'));
    fireEvent.click(screen.getByText('dashboard.title'));
    expect(useUiStore.getState().location).toEqual({ area: 'dashboard' });
  });
});
