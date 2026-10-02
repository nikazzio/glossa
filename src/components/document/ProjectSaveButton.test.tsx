import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectSaveButton } from './ProjectSaveButton';
import { useProjectStore } from '../../stores/projectStore';
import { useChunksStore } from '../../stores/chunksStore';

describe('ProjectSaveButton', () => {
  const saveCurrentProject = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useChunksStore.setState({ isProcessing: false });
    useProjectStore.setState({ saveState: 'saved', lastSaveError: null, saveCurrentProject });
  });

  it('is off when there is nothing to save', () => {
    render(<ProjectSaveButton />);
    expect(screen.getByRole('button', { name: 'transcription.saveNowNothing' })).toBeDisabled();
  });

  it('saves the translation when there are unsaved changes', () => {
    useProjectStore.setState({ saveState: 'dirty' });
    render(<ProjectSaveButton />);

    fireEvent.click(screen.getByRole('button', { name: 'document.saveNow (Ctrl+S)' }));

    expect(saveCurrentProject).toHaveBeenCalledTimes(1);
  });

  it('turns into a retry after a failed save', () => {
    useProjectStore.setState({ saveState: 'error', lastSaveError: null });
    render(<ProjectSaveButton />);

    fireEvent.click(screen.getByRole('button', { name: 'transcription.saveRetry' }));

    expect(saveCurrentProject).toHaveBeenCalledTimes(1);
  });

  it('is off with the reason while the pipeline runs', () => {
    useProjectStore.setState({ saveState: 'dirty' });
    useChunksStore.setState({ isProcessing: true });
    render(<ProjectSaveButton />);

    expect(screen.getByRole('button', { name: 'transcription.commandBlocked' })).toBeDisabled();
  });
});
