import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceIconPicker, WorkspaceIdentity } from './WorkspaceIdentity';

describe('Workspace identity', () => {
  it('exposes each preset choice with an accessible name', () => {
    render(<WorkspaceIconPicker value="book" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'workspace.icons.manuscript' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'workspace.icons.seal' })).toBeInTheDocument();
  });

  it('selects a new preset icon', async () => {
    const onChange = vi.fn();
    render(<WorkspaceIconPicker value="book" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'workspace.icons.archive' }));
    expect(onChange).toHaveBeenCalledWith('archive');
  });

  it('keeps the workspace name available when only its icon is rendered', () => {
    render(<WorkspaceIdentity workspace={{ name: 'Archivio Estense', iconKey: 'archive' }} iconOnly />);

    expect(screen.getByLabelText('Archivio Estense')).toBeInTheDocument();
  });
});
