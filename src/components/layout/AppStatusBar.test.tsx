import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppStatusBar } from './AppStatusBar';
import * as useStatusBarDataModule from '../../hooks/useStatusBarData';
import { useUiStore } from '../../stores/uiStore';
import { useJobsStore } from '../../stores/jobsStore';

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

  it('renders workspace name and area when inside an area', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'workspace',
      workspaceName: 'Test WS',
      projectCount: 3,
      areaName: 'translations',
    });
    render(<AppStatusBar />);
    expect(screen.getByText('Test WS')).toBeInTheDocument();
    expect(screen.getByText('Translations')).toBeInTheDocument();
  });

  it('renders the panel toggle and the save indicator in project context', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      projectName: 'Progetto A',
      pipelineName: 'Pipeline 1',
      sourceWords: 100,
      targetWords: 95,
      coveragePct: 95,
      saveState: 'saved',
      lastSavedAt: null,
      runStatus: 'idle',
      completedChunks: 5,
      totalChunks: 10,
      activePanel: null,
      panelSubTab: null,
    });
    render(<AppStatusBar />);
    // Il nome progetto non compare più nella barra (rimosso breadcrumb); il toggle console è sempre presente.
    expect(screen.getByRole('button', { name: 'statusBar.panelToggle' })).toBeInTheDocument();
  });

  it('shows save indicator as dirty', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      projectName: 'Progetto A',
      pipelineName: null,
      sourceWords: 0,
      targetWords: 0,
      coveragePct: 0,
      saveState: 'dirty',
      lastSavedAt: null,
      runStatus: 'idle',
      completedChunks: 0,
      totalChunks: 0,
      activePanel: null,
      panelSubTab: null,
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
      activePanel: null,
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
    useUiStore.setState({ showConsoleDrawer: false, drawerTab: 'jobs' });
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      projectName: 'Manoscritto',
      pipelineName: null,
      sourceWords: 0,
      targetWords: 0,
      coveragePct: 0,
      saveState: 'saved',
      lastSavedAt: null,
      runStatus: 'idle',
      completedChunks: 0,
      totalChunks: 0,
      activePanel: null,
      panelSubTab: null,
    });

    render(<AppStatusBar />);
    await user.click(screen.getByRole('button', { name: 'statusBar.panelToggle' }));

    expect(useUiStore.getState().drawerTab).toBe('console');
  });

  it('fuori da una traduzione lo stesso comando apre i lavori, che è ciò che esiste', async () => {
    const user = userEvent.setup();
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
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'workspace',
      workspaceName: 'Archivio',
      areaName: 'library',
      projectCount: 3,
    });

    render(<AppStatusBar />);

    expect(screen.getByText('Archivio')).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
  });
});
