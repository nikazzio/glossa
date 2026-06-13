import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceHome } from './WorkspaceHome';

vi.mock('../../hooks/useProviderKeyStatus', () => ({
  useProviderKeyStatus: () => ({
    statuses: {
      gemini: false,
      openai: false,
      anthropic: false,
      deepseek: false,
    },
    isLoading: false,
    refresh: vi.fn(),
  }),
}));

const initialUiState = useUiStore.getState();
const originalProjectState = useProjectStore.getState();
const originalWorkspaceState = useWorkspaceStore.getState();

describe('WorkspaceHome provider onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState(initialUiState, true);
    useProjectStore.setState({
      ...originalProjectState,
      projects: [],
      loadProjects: vi.fn().mockResolvedValue(undefined),
      createAndOpen: vi.fn().mockResolvedValue(undefined),
      openProject: vi.fn().mockResolvedValue(undefined),
      removeProject: vi.fn().mockResolvedValue(undefined),
    });
    useWorkspaceStore.setState({
      ...originalWorkspaceState,
      activeWorkspace: {
        id: 'workspace-1',
        name: 'Editorial',
        description: undefined,
        embeddingModel: 'text-embedding-3-small',
        memoryExtractorProvider: 'openai',
        memoryExtractorModel: 'gpt-5-nano',
        memoryExtractorPrompt: '',
        createdAt: '2026-01-01T10:00:00.000Z',
      },
      workspaces: [
        {
          id: 'workspace-1',
          name: 'Editorial',
          description: undefined,
          embeddingModel: 'text-embedding-3-small',
          memoryExtractorProvider: 'openai',
          memoryExtractorModel: 'gpt-5-nano',
          memoryExtractorPrompt: '',
          createdAt: '2026-01-01T10:00:00.000Z',
        },
      ],
      removeWorkspace: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('opens Settings on the provider tab from the onboarding banner', () => {
    render(<WorkspaceHome />);

    fireEvent.click(screen.getByRole('button', { name: 'workspace.providerBannerCta' }));

    const state = useUiStore.getState();
    expect(state.showSettings).toBe(true);
    expect(state.settingsTab).toBe('provider');
  });
});
