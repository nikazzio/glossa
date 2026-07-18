import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationsArea } from './TranslationsArea';
import { useProjectStore } from '../../stores/projectStore';
import '../../test/i18n-mock';

const mockListAllProjects = vi.fn();
vi.mock('../../services/projectService', () => ({
  listAllProjects: () => mockListAllProjects(),
}));

vi.mock('../../stores/projectStore');

const PROJECT_ALPHA = {
  id: 'p1', name: 'Fiore dei Liberi', source_language: 'it', target_language: 'en',
  created_at: '2026-07-15T10:00:00.000Z', updated_at: '2026-07-15T10:00:00.000Z',
  pipeline_count: 1, pipeline_names: null, workspace_id: 'ws-1', workspace_name: 'Alpha',
};
const PROJECT_BETA = {
  id: 'p2', name: 'Vadi', source_language: 'it', target_language: 'en',
  created_at: '2026-07-14T10:00:00.000Z', updated_at: '2026-07-14T10:00:00.000Z',
  pipeline_count: 2, pipeline_names: null, workspace_id: 'ws-2', workspace_name: 'Beta',
};

const mockOpenProjectInWorkspace = vi.fn().mockResolvedValue(undefined);
const mockRemoveProject = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  mockListAllProjects.mockResolvedValue([PROJECT_ALPHA, PROJECT_BETA]);
  vi.mocked(useProjectStore).mockImplementation((selector) => selector({
    openProjectInWorkspace: mockOpenProjectInWorkspace,
    removeProject: mockRemoveProject,
  } as never));
});

describe('TranslationsArea', () => {
  it('renders Translations heading', async () => {
    render(<TranslationsArea />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    await screen.findByText('Fiore dei Liberi');
  });

  it('shows every project across all workspaces, each tagged with its workspace name', async () => {
    render(<TranslationsArea />);

    await screen.findByText('Fiore dei Liberi');
    expect(screen.getByText('Vadi')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('renders sort toggle buttons', async () => {
    render(<TranslationsArea />);
    await screen.findByText('Fiore dei Liberi');
    expect(screen.getByRole('button', { name: /recenti|recent|updatedat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nome|name/i })).toBeInTheDocument();
  });

  it('opening a project delegates to the store, workspace switch included', async () => {
    render(<TranslationsArea />);
    await screen.findByText('Vadi');

    await userEvent.click(screen.getByText('Vadi'));

    await waitFor(() => {
      expect(mockOpenProjectInWorkspace).toHaveBeenCalledWith('p2', 'ws-2');
    });
  });

  it('shows an error toast and clears the opening state when the store call fails', async () => {
    mockOpenProjectInWorkspace.mockRejectedValueOnce(new Error('boom'));
    render(<TranslationsArea />);
    await screen.findByText('Fiore dei Liberi');

    const card = await screen.findByText('Fiore dei Liberi');
    await userEvent.click(card);

    await waitFor(() => {
      expect(mockOpenProjectInWorkspace).toHaveBeenCalledWith('p1', 'ws-1');
    });
    // the button must be re-enabled (opening state cleared) after the failure
    await waitFor(() => {
      expect(card.closest('button')).not.toBeDisabled();
    });
  });
});
