import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunksStore } from '../../stores/chunksStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { makeTranslationChunk } from '../../test/chunkFactory';
import { TranslationStudio } from './TranslationStudio';

// I comandi spenti dicono «Comando — motivo»: qui il formato si vede davvero.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { command?: string; reason?: string }) =>
      key === 'transcription.commandBlocked' && options ? `${options.command} — ${options.reason}` : key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}));

const initialUiState = useUiStore.getState();

function renderStudio(onBack = vi.fn()) {
  render(
    <TranslationStudio
      onBack={onBack}
      onImportDocument={vi.fn()}
      onRunPipeline={vi.fn()}
      onCancelPipeline={vi.fn()}
      onRetranslateChunk={vi.fn()}
      onReauditChunk={vi.fn()}
      onRunCoherenceAudit={vi.fn()}
    >
      <div>document-content</div>
    </TranslationStudio>,
  );
  return { onBack };
}

describe('TranslationStudio', () => {
  beforeEach(() => {
    useUiStore.setState(initialUiState, true);
    // La scheda Statistiche non legge niente dal database: le altre sì.
    useUiStore.setState({ showInsightPanel: true, studioTab: 'stats' });
    useChunksStore.setState({
      chunks: [makeTranslationChunk({ id: 'c1', sourceDisplayText: 'Uno' })],
      isProcessing: false,
      cancelRequested: false,
    });
    useProjectStore.setState({
      currentProjectId: 'p1',
      projects: [{ id: 'p1', name: 'Seneca' } as never],
      pipelines: [],
    });
  });

  it('shows the translation name and the whole-translation commands in the header', () => {
    renderStudio();

    expect(screen.getByText('Seneca')).toBeInTheDocument();
    expect(screen.getByText('document-content')).toBeInTheDocument();
    // Il documento c'è già: importa è spento e dice il motivo.
    expect(screen.getByRole('button', { name: 'files.import — document.reasonHasDocument' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'header.exportLabel' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'pipeline.configurePipeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'projects.delete' })).toBeInTheDocument();
  });

  it('keeps the workspace language resources one click away', () => {
    renderStudio();

    expect(screen.getByRole('button', { name: 'library.openLibrary' })).toBeInTheDocument();
  });

  it('goes back to the catalogue from the header, but not while the pipeline runs', () => {
    const { onBack } = renderStudio();

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.backToTranslations' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    act(() => useChunksStore.setState({ isProcessing: true }));
    expect(screen.getByRole('button', { name: 'sidebar.backToTranslations — document.reasonRunning' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'projects.delete — document.reasonRunning' })).toBeDisabled();
  });

  it('offers import on an empty translation and says why export is off', () => {
    useChunksStore.setState({ chunks: [] });
    renderStudio();

    expect(screen.getByRole('button', { name: 'files.import' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'header.exportLabel — document.reasonNoDocument' })).toBeDisabled();
  });

  it('orders the column tabs: glossary first, then the chunk work, the document last', () => {
    renderStudio();

    const column = screen.getByRole('tablist', { name: 'document.studioInspectorLabel' });
    const tabs = within(column).getAllByRole('tab').map((tab) => tab.getAttribute('aria-label'));
    expect(tabs.map((label) => label?.split(' — ')[0])).toEqual([
      'document.insightsTabGlossary',
      'document.insightsTabMemory',
      'document.insightsTabPromptPreview',
      'document.insightsTabReview',
      'document.insightsTabDocument',
    ]);
  });

  it('keeps the glossary off, with the reason, until one is assigned; memory and review stay open', () => {
    renderStudio();

    const glossary = screen.getByRole('tab', { name: /document\.insightsTabGlossary/ });
    expect(glossary).toHaveAttribute('aria-disabled', 'true');
    expect(glossary).toHaveAccessibleName('document.insightsTabGlossary — document.insightsGlossaryEmpty');
    expect(screen.getByRole('tab', { name: 'document.insightsTabMemory' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'document.insightsTabReview' })).not.toBeDisabled();
  });

  it('keeps the translate command visible with the column closed', () => {
    useUiStore.setState({ showInsightPanel: false });
    renderStudio();

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pipeline\.(executeAll|translateChunk)/ })).toBeInTheDocument();
  });

  it('keeps the open pipeline, its options and its languages together in the header, renamable from its menu', () => {
    const renamePipeline = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({
      pipelines: [{ id: 'pl1', name: 'Editoriale' } as never],
      activePipelineId: 'pl1',
      renamePipeline,
    });
    renderStudio();

    fireEvent.click(screen.getByRole('button', { name: 'Editoriale' }));
    fireEvent.click(screen.getByRole('button', { name: 'pipeline.renamePipeline' }));
    const field = screen.getByRole('textbox', { name: 'pipeline.pipelineNameLabel' });
    fireEvent.change(field, { target: { value: 'Revisione stilistica' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(renamePipeline).toHaveBeenCalledWith('pl1', 'Revisione stilistica');
    expect(screen.getByRole('button', { name: 'pipeline.changePipeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pipeline.configurePipeline' })).toBeInTheDocument();
  });
});
