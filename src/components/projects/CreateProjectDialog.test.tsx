import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateProjectDialog } from './CreateProjectDialog';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import '../../test/i18n-mock';

describe('CreateProjectDialog', () => {
  const createAndOpen = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ createAndOpen });
    useWorkspaceStore.setState({
      workspaces: [
        { id: 'ws-1', name: 'Archivio' } as never,
        { id: 'ws-2', name: 'Ricerca' } as never,
      ],
    });
  });

  it('creates directly in the given workspaceId, without showing a picker', async () => {
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} workspaceId="ws-2" />);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Nuovo progetto');
    await user.click(screen.getByRole('button', { name: 'projects.create' }));

    expect(createAndOpen).toHaveBeenCalledWith('Nuovo progetto', 'ws-2');
  });

  it('requires an explicit workspace pick when none is given (never falls back silently)', async () => {
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} />);

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), 'ws-2');
    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Nuovo progetto');
    await user.click(screen.getByRole('button', { name: 'projects.create' }));

    expect(createAndOpen).toHaveBeenCalledWith('Nuovo progetto', 'ws-2');
  });

  it('keeps create disabled when there is no workspace to pick from', async () => {
    useWorkspaceStore.setState({ workspaces: [] });
    const user = userEvent.setup();
    render(<CreateProjectDialog open onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('projects.namePlaceholder'), 'Nuovo progetto');

    expect(screen.getByRole('button', { name: 'projects.create' })).toBeDisabled();
    expect(createAndOpen).not.toHaveBeenCalled();
  });
});
