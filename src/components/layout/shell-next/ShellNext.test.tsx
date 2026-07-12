import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChunksStore } from '../../../stores/chunksStore';
import { useProjectStore } from '../../../stores/projectStore';
import { useUiStore } from '../../../stores/uiStore';
import { makeTranslationChunk } from '../../../test/chunkFactory';
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

    // La barra del progetto ha solo azioni di progetto + colonna operativa: niente tab di sezione.
    expect(screen.getByRole('button', { name: 'sidebar.backToWorkspace' })).toBeInTheDocument();
    expect(screen.getByText('document-content')).toBeInTheDocument();
  });

  it('no longer renders project-level section tabs (Pipeline / Document)', () => {
    renderShell();

    // I vecchi tab di sezione progetto non esistono più.
    expect(screen.queryByRole('tab', { name: 'projectShell.pipelineTab' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'projectShell.documentTab' })).not.toBeInTheDocument();
    // Il ChunkInspectorPanel embedded nella rail ha i propri tab (Audit/Note/Memoria): ok.
  });

  it('exposes project-scope import and export actions in the rail', () => {
    renderShell();

    expect(screen.getByRole('button', { name: 'files.import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'header.exportLabel' })).toBeInTheDocument();
  });

  it('moves chunk navigation into the operative rail', () => {
    useChunksStore.setState({
      chunks: [
        makeTranslationChunk({ id: 'c1', sourceDisplayText: 'One' }),
        makeTranslationChunk({ id: 'c2', sourceDisplayText: 'Two' }),
        makeTranslationChunk({ id: 'c3', sourceDisplayText: 'Three' }),
      ],
    });
    useUiStore.setState({ selectedChunkId: 'c2' });

    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'document.nextChunk' }));
    expect(useUiStore.getState().selectedChunkId).toBe('c3');
    expect(screen.getByRole('button', { name: 'document.previousChunk' })).toBeInTheDocument();
  });
});
