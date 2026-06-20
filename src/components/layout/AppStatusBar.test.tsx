import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppStatusBar } from './AppStatusBar';
import * as useStatusBarDataModule from '../../hooks/useStatusBarData';
import '../../test/i18n-mock';

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

  it('renders workspace name in workspace context', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'workspace',
      workspaceName: 'Test WS',
      projectCount: 3,
      areaName: null,
    });
    render(<AppStatusBar />);
    expect(screen.getByText('Test WS')).toBeInTheDocument();
  });

  it('renders project name and save state in project context', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      projectName: 'Progetto A',
      pipelineName: 'Pipeline 1',
      sourceWords: 100,
      targetWords: 95,
      coverageRatio: 95,
      saveState: 'saved',
      runStatus: 'idle',
      completedChunks: 5,
      totalChunks: 10,
    });
    render(<AppStatusBar />);
    expect(screen.getByText('Progetto A')).toBeInTheDocument();
  });

  it('shows save indicator as dirty', () => {
    vi.mocked(useStatusBarDataModule.useStatusBarData).mockReturnValue({
      kind: 'project',
      projectName: 'Progetto A',
      pipelineName: null,
      sourceWords: 0,
      targetWords: 0,
      coverageRatio: 0,
      saveState: 'dirty',
      runStatus: 'idle',
      completedChunks: 0,
      totalChunks: 0,
    });
    render(<AppStatusBar />);
    expect(screen.getByTitle(/unsaved/i)).toBeInTheDocument();
  });
});
