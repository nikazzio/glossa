import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceWizard } from './WorkspaceWizard';

const originalCreateAndActivate = useWorkspaceStore.getState().createAndActivate;

describe('WorkspaceWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      createAndActivate: originalCreateAndActivate,
    });
  });

  it('uses localized copy and does not ask for an embedding model', () => {
    render(<WorkspaceWizard />);

    expect(screen.getByText('workspace.wizardTitle')).toBeInTheDocument();
    expect(screen.getByText('workspace.wizardBody')).toBeInTheDocument();
    expect(screen.queryByText('workspace.embeddingModel')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('creates the workspace with the default embedding model', async () => {
    const createAndActivate = vi.fn().mockResolvedValue(undefined);
    useWorkspaceStore.setState({ createAndActivate });

    render(<WorkspaceWizard />);

    fireEvent.change(screen.getByPlaceholderText('workspace.namePlaceholder'), {
      target: { value: 'Editorial' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'workspace.createFirst' }));

    await waitFor(() => {
      expect(createAndActivate).toHaveBeenCalledWith({
        name: 'Editorial',
        description: undefined,
        embeddingModel: 'text-embedding-3-small',
      });
    });
  });
});
