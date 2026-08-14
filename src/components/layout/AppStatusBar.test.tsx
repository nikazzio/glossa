import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppStatusBar } from './AppStatusBar';
import * as useStatusBarDataModule from '../../hooks/useStatusBarData';
import { useUiStore } from '../../stores/uiStore';
import { useJobsStore } from '../../stores/jobsStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

vi.mock('../../hooks/useStatusBarData');

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'statusBar.saved': 'Saved',
        'statusBar.saving': 'Saving…',
        'statusBar.dirty': 'Unsaved changes',
        'statusBar.saveError': 'Save error',
        'statusBar.sourceWords': 'src',
        'statusBar.targetWords': 'tgt',
        'statusBar.coverage': 'coverage',
        'statusBar.chunks': 'chunks',
        'statusBar.running': 'Running…',
        'statusBar.completed': 'Completed',
        'statusBar.areaTranslations': 'Translations',
        'statusBar.areaLibrary': 'Library',
        'statusBar.areaTranscriptions': 'Transcriptions',
      })[key] ?? key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

describe('AppStatusBar', () => {
  it('renders nothing when kind is idle', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({ kind: 'idle' });
    const { container } = render(<AppStatusBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders only the dashboard label when on the app dashboard', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'workspace',
      workspaceName: 'Test WS',
      projectCount: 3,
      areaName: 'dashboard',
    });
    render(<AppStatusBar />);
    expect(screen.getByText('dashboard.title')).toBeInTheDocument();
    expect(screen.queryByText('Test WS')).not.toBeInTheDocument();
  });

  it('mostra l’area senza appenderla al workspace', () => {
    // Le aree sono globali: aprire un workspace non le rende sue, applica al
    // massimo un filtro (PRODUCT_ARCHITECTURE_2_0 §6). «Default / Biblioteca»
    // direbbe una cosa falsa.
    useUiStore.setState({ location: { area: 'translations' } });
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'workspace',
      workspaceName: 'Test WS',
      projectCount: 3,
      areaName: 'translations',
    });
    render(<AppStatusBar />);
    expect(screen.getByText('Translations')).toBeInTheDocument();
    expect(screen.queryByText('Test WS')).not.toBeInTheDocument();
  });

  it('il filtro workspace si legge come filtro, non come contenitore', () => {
    useUiStore.setState({
      location: { area: 'library', workspaceFilter: 'ws-1' },
    });
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws-1', name: 'Scherma' } as never],
    });
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'workspace',
      workspaceName: 'Scherma',
      projectCount: 1,
      areaName: 'library',
    });

    render(<AppStatusBar />);

    expect(screen.getByText('Library')).toBeInTheDocument();
    expect(screen.getByText('statusBar.workspaceFilter')).toBeInTheDocument();
  });

  it('renders the panel toggle and the save indicator in project context', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      projectName: 'Progetto A',
      saveState: 'saved',
      lastSavedAt: null,
      totalChunks: 10,
    });
    render(<AppStatusBar />);
    // Il nome progetto non compare più nella barra (rimosso breadcrumb); il toggle console è sempre presente.
    expect(screen.getByRole('button', { name: 'statusBar.panelToggle' })).toBeInTheDocument();
  });

  it('shows save indicator as dirty', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      projectName: 'Progetto A',
      saveState: 'dirty',
      lastSavedAt: null,
      totalChunks: 0,
    });
    render(<AppStatusBar />);
    expect(screen.getByText(/unsaved/i)).toBeInTheDocument();
  });
});

describe('pannello dei lavori dalla barra di stato', () => {
  const workspaceBar = {
    kind: 'workspace' as const,
    workspaceName: 'Archivio',
    areaName: 'dashboard',
    projectCount: 2,
  };

  beforeEach(() => {
    useUiStore.setState({ showConsoleDrawer: false, drawerTab: 'console' });
    useJobsStore.setState({
      jobs: [
        {
          id: 'j1',
          jobType: 'debug_counter',
          status: 'running',
          priority: 0,
          progress: 0.3,
          message: 'conteggio',
          config: '{}',
          checkpoint: null,
          attemptCount: 1,
          maxAttempts: 3,
          error: null,
          errorKind: null,
          etaSeconds: 60,
          waitingReason: null,
          phase: null,
          dependsOnJobId: null,
          nextAttemptAt: null,
          createdAt: null,
          updatedAt: null,
        },
      ],
    });
  });

  it('si apre anche fuori da un progetto, dove la console non esiste', async () => {
    // Il bug: il pannello si apriva solo dentro una traduzione, mentre i
    // lavori vanno guardati da qualunque sezione (D19).
    const user = userEvent.setup();
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue(workspaceBar);

    render(<AppStatusBar />);
    await user.click(screen.getByRole('button', { name: 'jobs.openPanel' }));

    expect(screen.getByRole('tabpanel', { name: 'jobs.tab' })).toBeInTheDocument();
  });

  it('il pannello si chiude dalla sua X, non solo dal comando in barra', async () => {
    const user = userEvent.setup();
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue(workspaceBar);
    useUiStore.setState({ showConsoleDrawer: true, drawerTab: 'jobs' });

    render(<AppStatusBar />);
    await user.click(screen.getByRole('button', { name: 'common.close' }));

    expect(useUiStore.getState().showConsoleDrawer).toBe(false);
  });

  it('l’indicatore sta nello stesso posto in ogni sezione', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue(workspaceBar);
    const { unmount } = render(<AppStatusBar />);
    const inWorkspace = screen.getByRole('button', { name: 'jobs.openPanel' });
    const workspaceCluster = inWorkspace.parentElement?.parentElement;
    const workspaceClasses = workspaceCluster?.className;
    unmount();

    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      totalChunks: 0,
      saveState: 'idle',
      lastSavedAt: null,
    } as never);
    render(<AppStatusBar />);
    const inProject = screen.getByRole('button', { name: 'jobs.openPanel' });

    expect(inProject.parentElement?.parentElement?.className).toBe(workspaceClasses);
  });
});

describe('continuità della barra di stato', () => {
  it('dentro una traduzione il pannello si apre sui messaggi', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ location: { area: 'translations', projectId: 'p1' } });
    useUiStore.setState({ showConsoleDrawer: false, drawerTab: 'jobs' });
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      projectName: 'Manoscritto',
      saveState: 'saved',
      lastSavedAt: null,
      totalChunks: 0,
    });

    render(<AppStatusBar />);
    await user.click(screen.getByRole('button', { name: 'statusBar.panelToggle' }));

    expect(useUiStore.getState().drawerTab).toBe('console');
  });

  it('fuori da una traduzione lo stesso comando apre i lavori, che è ciò che esiste', async () => {
    const user = userEvent.setup();
    useUiStore.setState({ location: { area: 'library' } });
    useUiStore.setState({ showConsoleDrawer: false, drawerTab: 'console' });
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'workspace',
      workspaceName: 'Archivio',
      areaName: 'library',
      projectCount: 1,
    });

    render(<AppStatusBar />);
    await user.click(screen.getByRole('button', { name: 'statusBar.panelToggle' }));

    expect(useUiStore.getState().drawerTab).toBe('jobs');
  });

  it('la posizione compare in ogni sezione, non solo nella dashboard', () => {
    useUiStore.setState({ location: { area: 'library' } });
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'workspace',
      workspaceName: 'Archivio',
      areaName: 'library',
      projectCount: 3,
    });

    render(<AppStatusBar />);

    expect(screen.getByText('Library')).toBeInTheDocument();
  });
});
