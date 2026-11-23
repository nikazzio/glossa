import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceSettingsModal } from './WorkspaceSettingsModal';

const originalWorkspaceState = useWorkspaceStore.getState();

describe('WorkspaceSettingsModal', () => {
  const updateActiveWorkspace = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      ...originalWorkspaceState,
      activeWorkspace: {
        id: 'ws-estense',
        name: 'Archivio Estense',
        description: 'Trattati storici',
        iconKey: 'archive',
        embeddingModel: 'text-embedding-3-small',
        memoryExtractorProvider: 'openai',
        memoryExtractorModel: 'gpt-5.4-nano',
        memoryExtractorPrompt: 'Estrai le frasi.',
        ocrDefaultProvider: '', ocrDefaultModel: '', ocrDefaultPrompt: '', ocrSeparateNotes: true, memorySearchAllWorkspaces: false,
        createdAt: '2026-07-28T00:00:00.000Z',
      },
      workspaces: [],
      updateActiveWorkspace,
    });
  });

  it('saves the general workspace identity and closes on success', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WorkspaceSettingsModal open onClose={onClose} />);

    await user.clear(screen.getByLabelText('workspace.nameLabel'));
    await user.type(screen.getByLabelText('workspace.nameLabel'), 'Archivio Mediceo');
    await user.click(screen.getByRole('button', { name: 'workspace.icons.anchor' }));
    await user.click(screen.getByRole('button', { name: 'common.save' }));

    expect(updateActiveWorkspace).toHaveBeenCalledWith({
      name: 'Archivio Mediceo',
      description: 'Trattati storici',
      iconKey: 'anchor',
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('no longer offers a search-all-workspaces switch in the memory tab and never saves it', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSettingsModal open onClose={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'workspace.settings.memoryTab' }));
    expect(screen.queryByRole('switch', { name: 'workspace.memorySearchAllWorkspaces' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'common.save' }));
    expect(updateActiveWorkspace).toHaveBeenCalledWith(expect.not.objectContaining({ memorySearchAllWorkspaces: expect.anything() }));
  });
  it('salva le note separate dal testo dalla scheda OCR', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSettingsModal open onClose={vi.fn()} />);
    await user.click(screen.getByRole('tab', { name: 'workspace.settings.ocrTab' }));
    const toggle = screen.getByRole('switch', { name: 'workspace.settings.ocrSeparateNotes' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'common.save' }));
    expect(updateActiveWorkspace).toHaveBeenCalledWith(expect.objectContaining({ ocrSeparateNotes: false }));
  });
});
