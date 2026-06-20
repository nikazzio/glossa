import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationsArea } from './TranslationsArea';
import { useUiStore } from '../../stores/uiStore';
import { useProjectStore } from '../../stores/projectStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import '../../test/i18n-mock';

vi.mock('../../stores/uiStore');
vi.mock('../../stores/projectStore');
vi.mock('../../stores/workspaceStore');

const mockSetActiveWorkspaceArea = vi.fn();
const mockLoadProjects = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useUiStore).mockReturnValue({
    setActiveWorkspaceArea: mockSetActiveWorkspaceArea,
  } as ReturnType<typeof useUiStore>);
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

  it('back button calls setActiveWorkspaceArea(null)', async () => {
    render(<TranslationsArea />);
    const backBtn = screen.getByRole('button', { name: /test workspace/i });
    await userEvent.click(backBtn);
    expect(mockSetActiveWorkspaceArea).toHaveBeenCalledWith(null);
  });

  it('renders sort toggle buttons', () => {
    render(<TranslationsArea />);
    expect(screen.getByRole('button', { name: /recenti|recent|updatedat/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nome|name/i })).toBeInTheDocument();
  });
});
