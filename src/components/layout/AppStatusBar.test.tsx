import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppStatusBar } from './AppStatusBar';
import * as useStatusBarDataModule from '../../hooks/useStatusBarData';

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

  it('renders console toggle and save indicator in project context', () => {
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
    expect(screen.getByRole('button', { name: 'console.toggle' })).toBeInTheDocument();
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
