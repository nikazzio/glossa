import { render, screen } from '@testing-library/react';
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
});
