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

  it('collapses the contextual column without changing the selected tab', () => {
    render(<PipelineSidebar />);

    fireEvent.click(screen.getByRole('button', { name: 'projectShell.collapseContext' }));

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
});
