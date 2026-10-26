import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '../../stores/libraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { confirm } from '../../stores/confirmStore';
import { LibraryPanel } from './LibraryPanel';

vi.mock('./DictionariesTab', () => ({ DictionariesTab: () => null }));
vi.mock('./MemoriesTab', () => ({ MemoriesTab: () => null }));
vi.mock('./PromptTemplatesTab', () => ({ PromptTemplatesTab: ({ onEditingChange }: { onEditingChange: (value: boolean) => void }) =>
  <button onClick={() => onEditingChange(true)}>Start editing</button> }));
vi.mock('../../stores/confirmStore', () => ({ confirm: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const original = useLibraryStore.getState();
const saveAllDirty = vi.fn();
const discardDirty = vi.fn();

describe('Language resources window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({ activeWorkspace: null });
    useLibraryStore.setState({ ...original, showLibraryPanel: true, libraryScope: 'global', dirtyIds: [],
      loadGlossaries: vi.fn().mockResolvedValue(undefined), saveAllDirty, discardDirty });
  });
  it('keeps dictionary drafts open if saving on close fails', async () => {
    useLibraryStore.setState({ dirtyIds: ['dictionary'] });
    vi.mocked(confirm).mockResolvedValue(true);
    saveAllDirty.mockRejectedValueOnce(new Error('disk full'));
    render(<LibraryPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'common.close' }));
    await waitFor(() => expect(saveAllDirty).toHaveBeenCalled());
    expect(useLibraryStore.getState().showLibraryPanel).toBe(true);
    expect(discardDirty).not.toHaveBeenCalled();
  });
  it('discards dictionary drafts when closing without saving', async () => {
    useLibraryStore.setState({ dirtyIds: ['dictionary'] });
    vi.mocked(confirm).mockResolvedValue(false);
    render(<LibraryPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'common.close' }));
    await waitFor(() => expect(discardDirty).toHaveBeenCalledOnce());
    expect(useLibraryStore.getState().showLibraryPanel).toBe(false);
  });
  it('protects a template form from tab switches and accidental close', async () => {
    useLibraryStore.setState({ activeTab: 'templates' });
    vi.mocked(confirm).mockResolvedValue(false);
    render(<LibraryPanel />);
    await userEvent.click(screen.getByRole('button', { name: 'Start editing' }));
    expect(screen.getByRole('tab', { name: 'library.tabMemories — library.finishEditing' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'common.close' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'library.discardDraftTitle' })));
    expect(useLibraryStore.getState().showLibraryPanel).toBe(true);
  });
});
