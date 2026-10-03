import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigDrawer } from './ConfigDrawer';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';
import { usePipelineStore } from '../../stores/pipelineStore';
import type { Pipeline, TranslationChunk } from '../../types';

vi.mock('../../services/glossaryService', () => ({
  assignGlossaryToProject: vi.fn(),
  upsertGlossaryEntries: vi.fn(),
  listGlossaries: vi.fn().mockResolvedValue([]),
}));

const pipeline: Pipeline = {
  id: 'pipe-1',
  projectId: 'proj-1',
  name: 'Draft A',
  sourceLanguage: 'it',
  targetLanguage: 'en',
  mode: 'standard',
  runStatus: 'idle',
  lastRunConfig: null,
  createdAt: '2026-08-22',
  updatedAt: '2026-08-22',
};

const completedChunk = { id: 'c1', status: 'completed' } as unknown as TranslationChunk;

describe('ConfigDrawer', () => {
  beforeEach(() => {
    useUiStore.setState({ showConfigDrawer: true });
    useProjectStore.setState({ currentProjectId: 'proj-1', activePipelineId: 'pipe-1', pipelines: [pipeline] });
    useChunksStore.setState({ chunks: [], isProcessing: false });
    usePipelineStore.setState((state) => ({ config: { ...state.config, mode: 'standard' } }));
  });

  it('shows the pipeline name as the window title, with no rename field', () => {
    render(<ConfigDrawer />);
    expect(screen.getByRole('heading', { name: 'Draft A' })).toBeInTheDocument();
    expect(screen.queryByLabelText('pipeline.pipelineNameLabel')).not.toBeInTheDocument();
  });

  it('opens on the stages tab and switches tab from the shared tab row', () => {
    render(<ConfigDrawer />);
    expect(screen.getByRole('tab', { name: 'pipeline.tabTranslation' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'pipeline.tabGlossary' }));
    expect(screen.getByRole('tab', { name: 'pipeline.tabGlossary' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'pipeline.tabGlossary' })).toBeInTheDocument();
  });

  it('turns the memory tab off, with its reason, in DeepL mode', () => {
    usePipelineStore.setState((state) => ({ config: { ...state.config, mode: 'deepl-hybrid' } }));
    render(<ConfigDrawer />);
    expect(screen.getByRole('tab', { name: 'transcription.commandBlocked' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('keeps the reset icon visible but off when nothing is translated', () => {
    render(<ConfigDrawer />);
    expect(screen.getByRole('button', { name: 'transcription.commandBlocked' })).toBeDisabled();
  });

  it('enables the reset icon once a translation exists', () => {
    useChunksStore.setState({ chunks: [completedChunk] });
    render(<ConfigDrawer />);
    expect(screen.getByRole('button', { name: 'pipeline.resetAll' })).toBeEnabled();
  });

  it('covers the tab with the shared veil while the pipeline runs', () => {
    useChunksStore.setState({ chunks: [completedChunk], isProcessing: true });
    render(<ConfigDrawer />);
    expect(screen.getByRole('status')).toHaveTextContent('pipeline.settingsLockedWhileRunning');
  });
});
