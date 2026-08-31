import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useChunksStore } from '../../stores/chunksStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
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
    useUiStore.setState({ location: { area: 'dashboard' } });
  });

  it('hides the workspace breadcrumb on the app dashboard', () => {
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'workspace-1', name: 'Scholars' } as never,
      workspaces: [{ id: 'workspace-1', name: 'Scholars' } as never],
    });

    render(<Header />);

    expect(screen.queryByText('Scholars')).not.toBeInTheDocument();
  });

  it('shows the translations area in the breadcrumb', () => {
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'workspace-1', name: 'Scholars' } as never,
      workspaces: [{ id: 'workspace-1', name: 'Scholars' } as never],
    });
    useUiStore.setState({ location: { area: 'translations' } });

    render(<Header />);

    expect(screen.getByText('areas.translations.title')).toBeInTheDocument();
    expect(screen.queryByText('Scholars')).not.toBeInTheDocument();
  });

  it('uses translations as the parent of a project without a workspace', () => {
    const closeProject = vi.fn();
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'workspace-1', name: 'Scholars' } as never,
      workspaces: [{ id: 'workspace-1', name: 'Scholars' } as never],
    });
    useProjectStore.setState({
      currentProjectId: 'project-1',
      projects: [{ id: 'project-1', name: 'Draft', workspace_id: null } as never],
      closeProject,
    });

    render(<Header />);

    expect(screen.getByText('areas.translations.title')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.queryByText('Scholars')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'areas.translations.title' }));

    expect(closeProject).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().location).toEqual({ area: 'translations' });
  });

  it('renders the project breadcrumb and returns to the workspace dashboard', () => {
    const closeProject = vi.fn();
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'workspace-1', name: 'Scholars' } as never,
      workspaces: [{ id: 'workspace-1', name: 'Scholars' } as never],
    });
    useProjectStore.setState({
      currentProjectId: 'project-1',
      projects: [{ id: 'project-1', name: 'Draft', workspace_id: 'workspace-1' } as never],
      closeProject,
    });

    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: 'Scholars' }));

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(closeProject).toHaveBeenCalledTimes(1);
  });
});

describe('breadcrumb: un segmento porta dove dice', () => {
  it('il workspace apre la sua home, non torna indietro', () => {
    // Prima chiudeva il progetto e lasciava l'utente dov'era: dalla dashboard
    // si tornava in dashboard, che non è dove il segmento dice di portare.
    useProjectStore.setState({ currentProjectId: null, projects: [] });
    useChunksStore.setState({ isProcessing: false });
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'ws-1', name: 'Archivio' } as never,
      workspaces: [{ id: 'ws-1', name: 'Archivio' } as never],
    });
    useUiStore.setState({ location: { area: 'workspace', workspaceId: 'ws-1' } });

    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: /Archivio/ }));

    expect(useUiStore.getState().location).toEqual({ area: 'workspace', workspaceId: 'ws-1' });
  });

  it.each([
    ['library', 'areas.library.title'],
    ['transcriptions', 'areas.transcriptions.title'],
    ['analysis', 'areas.analysis.title'],
  ] as const)(
    "l'area globale %s mostra il proprio nome, non quello del workspace attivo",
    (area, labelKey) => {
      // Le aree globali (#210) non dipendono da un workspace attivo: prima il
      // titolo cadeva sul nome del workspace da cui si veniva, anche entrando
      // in un'area che non ha niente a che fare con quel workspace.
      useProjectStore.setState({ currentProjectId: null, projects: [] });
      useChunksStore.setState({ isProcessing: false });
      useWorkspaceStore.setState({
        activeWorkspace: { id: 'ws-1', name: 'Archivio' } as never,
        workspaces: [{ id: 'ws-1', name: 'Archivio' } as never],
      });
      useUiStore.setState({ location: { area } });

      render(<Header />);

      expect(screen.getByText(labelKey)).toBeInTheDocument();
      expect(screen.queryByText('Archivio')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: labelKey }));

      expect(useUiStore.getState().location).toEqual({ area });
    },
  );
});
