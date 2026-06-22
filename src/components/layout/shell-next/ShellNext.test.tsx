import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunksStore } from '../../../stores/chunksStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useUiStore } from '../../../stores/uiStore';
import { ShellNext } from './ShellNext';

const initialUiState = useUiStore.getState();

function renderShell() {
  return render(
    <ShellNext onReauditChunk={vi.fn()} onRunCoherenceAudit={vi.fn()}>
      <div>document-content</div>
    </ShellNext>,
  );
}

describe('ShellNext (#291)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState(initialUiState, true);
    useChunksStore.setState({ chunks: [], isProcessing: false, cancelRequested: false });
    useProjectStore.setState({ closeProject: vi.fn() });
  });

  it('renders the operative rail, content, and right inspector without crashing', () => {
    renderShell();

    // Colonna operativa unica + Documento (run/pipeline fusi; insight/chunk spostati a destra).
    expect(screen.getByRole('tab', { name: 'projectShell.pipelineTab' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'projectShell.documentTab' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'projectShell.runTab' })).not.toBeInTheDocument();
    expect(screen.getByText('document-content')).toBeInTheDocument();
  });

  it('switches the contextual column to Document', () => {
    renderShell();

    fireEvent.click(screen.getByRole('tab', { name: 'projectShell.documentTab' }));

    expect(useUiStore.getState().activeProjectPanel).toBe('document');
    expect(screen.getByText('projectShell.noDocumentHint')).toBeInTheDocument();
  });

  it('keeps the operative tab active by default (run state maps to pipeline tab)', () => {
    renderShell();

    expect(screen.getByRole('tab', { name: 'projectShell.pipelineTab' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'projectShell.documentTab' })).toHaveAttribute('tabindex', '-1');
  });
});
