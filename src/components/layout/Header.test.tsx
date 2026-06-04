import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from './Header';
import { useChunksStore } from '../../stores/chunksStore';
import { useLibraryStore } from '../../stores/libraryStore';
import { useProjectStore } from '../../stores/projectStore';

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: toastMocks,
}));

const originalProjectSave = useProjectStore.getState().saveCurrentProject;
const originalLibrarySave = useLibraryStore.getState().saveAllDirty;

describe('Header global save', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useProjectStore.setState({
      currentProjectId: null,
      projects: [],
      saveCurrentProject: originalProjectSave,
    });
    useLibraryStore.setState({
      dirtyIds: [],
      saveAllDirty: originalLibrarySave,
      showLibraryPanel: false,
    });
    useChunksStore.setState({
      isProcessing: false,
    });
  });

  it('keeps save enabled without an open project and saves dirty library entries', async () => {
    const saveAllDirty = vi.fn().mockResolvedValue(undefined);
    useLibraryStore.setState({ dirtyIds: ['glossary-1'], saveAllDirty });

    render(<Header />);

    const saveButton = screen.getByRole('button', { name: 'header.saveAll' });
    expect(saveButton).not.toBeDisabled();

    fireEvent.click(saveButton);

    await waitFor(() => expect(saveAllDirty).toHaveBeenCalledTimes(1));
    expect(toastMocks.success).toHaveBeenCalledWith('header.savedAll');
  });

  it('saves the current project and dirty library entries from the same action', async () => {
    const saveCurrentProject = vi.fn().mockResolvedValue(undefined);
    const saveAllDirty = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({
      currentProjectId: 'project-1',
      projects: [{ id: 'project-1', name: 'Draft' } as never],
      saveCurrentProject,
    });
    useLibraryStore.setState({ dirtyIds: ['glossary-1'], saveAllDirty });

    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: 'header.saveAll' }));

    await waitFor(() => expect(saveCurrentProject).toHaveBeenCalledTimes(1));
    expect(saveAllDirty).toHaveBeenCalledTimes(1);
    expect(toastMocks.success).toHaveBeenCalledWith('header.savedAll');
  });

  it('defers project save while processing but still saves dirty library entries', async () => {
    const saveCurrentProject = vi.fn().mockResolvedValue(undefined);
    const saveAllDirty = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({
      currentProjectId: 'project-1',
      projects: [{ id: 'project-1', name: 'Draft' } as never],
      saveCurrentProject,
    });
    useLibraryStore.setState({ dirtyIds: ['glossary-1'], saveAllDirty });
    useChunksStore.setState({ isProcessing: true });

    render(<Header />);
    fireEvent.click(screen.getByRole('button', { name: 'header.saveAll' }));

    await waitFor(() => expect(saveAllDirty).toHaveBeenCalledTimes(1));
    expect(saveCurrentProject).not.toHaveBeenCalled();
    expect(toastMocks.warning).toHaveBeenCalledWith('header.savedLibraryProjectDeferred');
  });
});
