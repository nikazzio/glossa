import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useChunksStore } from '../../../stores/chunksStore';
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
    useProjectStore.setState({ leaveProject: vi.fn().mockResolvedValue(true), loadProjects: vi.fn() });
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

  it('clicking a workspace in the rail activates it and navigates to its page', async () => {
    renderShell();

    fireEvent.click(screen.getByText('Beta'));

    await waitFor(() => expect(useWorkspaceStore.getState().setActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ws-2' }),
    ));
  });

  it('clicking the active workspace navigates to its page without re-activating', () => {
    renderShell();

    fireEvent.click(screen.getByText('Alpha'));

    expect(useUiStore.getState().location).toEqual({ area: 'workspace', workspaceId: 'ws-1' });
    expect(useWorkspaceStore.getState().setActive).not.toHaveBeenCalled();
  });

  it('shows Home, Search, every area and workspace icons when the rail is collapsed', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.collapse' }));
    expect(screen.getByRole('button', { name: /Beta/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dashboard\.title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^federation\.title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /areas\.translations\.title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /areas\.library\.title/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /areas\.transcriptions\.title/ })).not.toBeDisabled();
  });

  it('lists Home, then Search, then the areas, with no views under Home', () => {
    renderShell();

    const home = screen.getByRole('button', { name: /^dashboard\.title/ });
    const search = screen.getByRole('button', { name: /^federation\.title/ });
    const library = screen.getByRole('button', { name: /areas\.library\.title/ });
    expect(home.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search.compareDocumentPosition(library) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('overview.title')).not.toBeInTheDocument();
  });

  it('opens Search from its own nav item and marks only it as current', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: /^federation\.title/ }));
    expect(useUiStore.getState().location).toEqual({ area: 'search' });
    expect(screen.getByRole('button', { name: /^federation\.title/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /^dashboard\.title/ })).not.toHaveAttribute('aria-current');
  });

  it('opens Statistics from Analysis and marks both as current', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: /areas\.analysis\.title/ }));
    expect(useUiStore.getState().location).toEqual({ area: 'analysis' });
    expect(screen.getByRole('button', { name: /areas\.analysis\.title/ })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /^dashboardStats\.title/ })).toHaveAttribute('aria-current', 'page');
  });

  it('opens Statistics from its item under Analysis', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: /^dashboardStats\.title/ }));
    expect(useUiStore.getState().location).toEqual({ area: 'analysis', view: 'stats' });
    expect(screen.getByRole('button', { name: /areas\.analysis\.title/ })).toHaveAttribute('aria-current', 'page');
  });

  it('places Library before Translations in the area navigation', () => {
    renderShell();

    const library = screen.getAllByRole('button', { name: /areas\.library\.title/ })[0];
    const translations = screen.getAllByRole('button', { name: /areas\.translations\.title/ })[0];

    expect(library.compareDocumentPosition(translations) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('selects the translations area and keeps it selected on a second click (radio, no toggle)', () => {
    renderShell();

    fireEvent.click(screen.getByText('areas.translations.title'));
    expect(useUiStore.getState().location).toEqual({ area: 'translations' });

    fireEvent.click(screen.getByText('areas.translations.title'));
    expect(useUiStore.getState().location).toEqual({ area: 'translations' });
  });

  it('returns home from the standalone Home nav item', () => {
    renderShell();

    fireEvent.click(screen.getByText('areas.translations.title'));
    fireEvent.click(screen.getByText('dashboard.title'));
    expect(useUiStore.getState().location).toEqual({ area: 'home' });
  });

  describe('with a translation open', () => {
    beforeEach(() => {
      useProjectStore.setState({ currentProjectId: 'p1' });
      useChunksStore.setState({ isProcessing: false });
      useUiStore.setState({ location: { area: 'home' } });
    });

    it('marks Translations as the current area, not the place the translation was opened from', () => {
      renderShell();

      expect(screen.getByRole('button', { name: /areas\.translations\.title/ })).toHaveAttribute('aria-current', 'page');
      expect(screen.getByRole('button', { name: /^dashboard\.title/ })).not.toHaveAttribute('aria-current');
    });

    it('saves and closes the translation before going to another area', async () => {
      renderShell();

      fireEvent.click(screen.getByText('areas.library.title'));

      expect(useProjectStore.getState().leaveProject).toHaveBeenCalled();
      await waitFor(() => expect(useUiStore.getState().location).toEqual({ area: 'library' }));
    });

    it('stays in the translation when the save before leaving fails', async () => {
      useProjectStore.setState({ leaveProject: vi.fn().mockResolvedValue(false) });
      const before = useUiStore.getState().location;
      renderShell();

      fireEvent.click(screen.getByText('areas.library.title'));

      await waitFor(() => expect(useProjectStore.getState().leaveProject).toHaveBeenCalled());
      expect(useUiStore.getState().location).toEqual(before);
    });

    it('turns every destination off while the pipeline runs', () => {
      useChunksStore.setState({ isProcessing: true });
      renderShell();

      expect(screen.getByRole('button', { name: /areas\.library\.title/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /^dashboard\.title/ })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Beta/ })).toBeDisabled();
    });
  });
});
