import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationsArea } from './TranslationsArea';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import '../../test/i18n-mock';

vi.mock('../../stores/projectStore');
vi.mock('../../stores/workspaceStore');

const mockLoadProjects = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useProjectStore).mockReturnValue({
    projects: [],
    loadProjects: mockLoadProjects,
    createAndOpen: vi.fn(),
    openProject: vi.fn(),
    removeProject: vi.fn(),
  } as ReturnType<typeof useProjectStore>);
  vi.mocked(useWorkspaceStore).mockReturnValue({
    activeWorkspace: { id: 'ws1', name: 'Test Workspace' },
  } as ReturnType<typeof useWorkspaceStore>);
});

describe('TranslationsArea', () => {
  it('renders Translations heading', () => {
    render(<TranslationsArea />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('shows the workspace name as context eyebrow without a back button', () => {
    render(<TranslationsArea />);
    expect(screen.getByText('Test Workspace')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /back|backLabel/i })).not.toBeInTheDocument();
  });

  it('renders sort toggle buttons', () => {
    render(<TranslationsArea />);
    expect(screen.getByRole('button', { name: /recenti|recent|updatedat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nome|name/i })).toBeInTheDocument();
  });
});
