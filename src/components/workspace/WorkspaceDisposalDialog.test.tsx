import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceDisposalDialog } from './WorkspaceDisposalDialog';
import { workspaceContents } from '../../services/workspaceService';
import type { Workspace } from '../../types';

vi.mock('../../services/workspaceService', () => ({
  workspaceContents: vi.fn(),
}));

function workspace(id: string, name: string): Workspace {
  return {
    id,
    name,
    iconKey: 'book',
    embeddingModel: 'text-embedding-3-small',
    memoryExtractorProvider: 'openai',
    memoryExtractorModel: 'gpt-5.4-nano',
    memoryExtractorPrompt: 'estrai',
    createdAt: '2026-08-01',
  };
}

describe('eliminare un workspace', () => {
  const onConfirm = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    onConfirm.mockClear();
    vi.mocked(workspaceContents).mockResolvedValue({
      projects: 3,
      glossaries: 1,
      phrases: 40,
      transcriptions: 0,
      linkedSources: 2,
    });
  });

  const open = () =>
    render(
      <WorkspaceDisposalDialog
        open
        workspace={workspace('ws1', 'Scherma')}
        others={[workspace('ws2', 'Filologia')]}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

  it('dice cosa c è dentro prima di far scegliere', async () => {
    // Prima il comando si rifiutava e basta: «ci sono dei progetti», senza dire
    // quanti né offrire una via d'uscita.
    open();

    expect(await screen.findByText('workspace.disposal.message')).toBeInTheDocument();
    // Le opere collegate non sono fra le scelte: si scollegano e restano.
    expect(screen.getByText('workspace.disposal.sourcesStay')).toBeInTheDocument();
  });

  it('sposta tutto nel workspace scelto', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByText('workspace.disposal.message');

    await user.click(screen.getByRole('button', { name: 'workspace.disposal.moveConfirm' }));

    expect(onConfirm).toHaveBeenCalledWith({ kind: 'moveTo', workspaceId: 'ws2' });
  });

  it('oppure elimina tutto, e lo dice prima', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByText('workspace.disposal.message');

    expect(screen.getByText('workspace.disposal.deleteWarning')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /workspace.disposal.deleteConfirm/ }));

    expect(onConfirm).toHaveBeenCalledWith({ kind: 'deleteEverything' });
  });

  it('su un workspace vuoto non offre di spostare niente', async () => {
    vi.mocked(workspaceContents).mockResolvedValue({
      projects: 0,
      glossaries: 0,
      phrases: 0,
      transcriptions: 0,
      linkedSources: 0,
    });
    open();

    expect(await screen.findByText('workspace.disposal.emptyMessage')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'workspace.disposal.moveConfirm' }),
    ).not.toBeInTheDocument();
  });
});
