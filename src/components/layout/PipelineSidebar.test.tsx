import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunksStore } from '../../stores/chunksStore';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { PipelineSidebar } from './PipelineSidebar';

const initialUiState = useUiStore.getState();

describe('PipelineSidebar project shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState(initialUiState, true);
    useChunksStore.setState({
      chunks: [],
      isProcessing: false,
      cancelRequested: false,
    });
    useProjectStore.setState({ closeProject: vi.fn() });
  });

  it('switches the contextual column from Run to Document', () => {
    render(<PipelineSidebar />);

    fireEvent.click(screen.getByRole('tab', { name: 'projectShell.documentTab' }));

    expect(useUiStore.getState().activeProjectPanel).toBe('document');
    expect(screen.getByText('projectShell.noDocumentHint')).toBeInTheDocument();
  });

  it('collapses the contextual column when the active tab is clicked again', () => {
    render(<PipelineSidebar />);

    // Run è il tab attivo di default: ri-cliccarlo comprime la barra.
    fireEvent.click(screen.getByRole('tab', { name: 'projectShell.runTab' }));

    expect(useUiStore.getState().projectContextCollapsed).toBe(true);
    expect(useUiStore.getState().activeProjectPanel).toBe('run');
    expect(screen.queryByText('pipeline.modeLabel')).not.toBeInTheDocument();
  });

  it('keeps Run Audit Only reachable from document mode', () => {
    const onRunAuditOnly = vi.fn();
    useChunksStore.setState({
      chunks: [
        {
          id: 'chunk-1',
          originalText: 'Source',
          currentDraft: 'Translation',
          status: 'completed',
        } as never,
      ],
      isProcessing: false,
    });

    render(<PipelineSidebar onRunAuditOnly={onRunAuditOnly} />);

    fireEvent.click(screen.getByRole('button', { name: 'pipeline.runAuditOnly' }));

    expect(onRunAuditOnly).toHaveBeenCalledTimes(1);
  });

  it('opens the insight fly-out and collapses the primary bar when insight is selected', () => {
    render(<PipelineSidebar />);

    fireEvent.click(screen.getByRole('tab', { name: 'projectShell.insightTab' }));

    expect(useUiStore.getState().activeProjectPanel).toBe('insight');
    expect(useUiStore.getState().showDocumentDrawer).toBe(true);
    expect(useUiStore.getState().projectContextCollapsed).toBe(true);
  });

  it('applies a roving tabindex with only the active rail tab reachable by Tab', () => {
    render(<PipelineSidebar />);

    // Default: Run attivo → tabIndex 0, gli altri -1.
    expect(screen.getByRole('tab', { name: 'projectShell.runTab' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'projectShell.documentTab' })).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus down the rail with the ArrowDown key without activating', () => {
    render(<PipelineSidebar />);

    const runTab = screen.getByRole('tab', { name: 'projectShell.runTab' });
    runTab.focus();
    fireEvent.keyDown(runTab, { key: 'ArrowDown' });

    // Il focus si sposta su Pipeline ma il pannello attivo resta Run (attivazione manuale).
    expect(screen.getByRole('tab', { name: 'projectShell.pipelineTab' })).toHaveFocus();
    expect(useUiStore.getState().activeProjectPanel).toBe('run');
  });

  it('jumps focus to the last rail tab with the End key', () => {
    render(<PipelineSidebar />);

    const runTab = screen.getByRole('tab', { name: 'projectShell.runTab' });
    runTab.focus();
    fireEvent.keyDown(runTab, { key: 'End' });

    expect(screen.getByRole('tab', { name: 'projectShell.chunkTab' })).toHaveFocus();
  });
});
