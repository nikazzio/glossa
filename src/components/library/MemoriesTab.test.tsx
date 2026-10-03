import { makeMemoryEntry } from '../../test/memoryEntryFactory';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '../../stores/libraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { listPhraseMemoryEntries, updatePhraseMemoryEntry, type PhraseMemoryEntry } from '../../services/phraseMemoryService';
import { MemoriesTab } from './MemoriesTab';

vi.mock('react-i18next', () => { const t = (key: string) => key; return { useTranslation: () => ({ t }) }; });

vi.mock('../../services/phraseMemoryService', () => ({ listPhraseMemoryEntries: vi.fn(), updatePhraseMemoryEntry: vi.fn().mockResolvedValue(undefined),
  addPhraseMemoryEmbedding: vi.fn(), setPhraseMemoryTags: vi.fn().mockResolvedValue(undefined), deletePhraseMemoryEntry: vi.fn(), exportPhraseMemoryToCsv: vi.fn(), getProjectNames: vi.fn().mockResolvedValue({}), getChunkPositions: vi.fn().mockResolvedValue({}) }));
vi.mock('../../stores/confirmStore', () => ({ confirm: vi.fn().mockResolvedValue(true) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const entry: PhraseMemoryEntry = makeMemoryEntry({ id: 'phrase-1', workspaceId: null, projectId: 'project-1', chunkId: null,
  embeddings: [{ provider: 'openai', model: 'text-embedding-3-large', dimensions: 3072, profile: 'source-verbatim-v1' }] });

describe('Memory resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useLibraryStore.setState({ libraryScope: 'global', glossaries: [], dirtyIds: [] });
    useWorkspaceStore.setState({ activeWorkspace: null, workspaces: [] });
    vi.mocked(listPhraseMemoryEntries).mockResolvedValue([entry]);
  });
  it('lists all phrases including those with no workspace, even when no workspace exists', async () => {
    render(<MemoriesTab />);
    expect(await screen.findByText('Salve')).toBeInTheDocument();
    expect(listPhraseMemoryEntries).toHaveBeenCalledWith(null);
    expect(screen.getAllByText('memory.provenance.noWorkspace').length).toBeGreaterThan(0);
  });
  it('edits an unassigned phrase using its own embedding model', async () => {
    render(<MemoriesTab />);
    await screen.findByText('Salve');
    await userEvent.click(screen.getByRole('button', { name: 'common.edit' }));
    await userEvent.type(screen.getByLabelText('memory.sourcePhraseLabel'), ' amice');
    await userEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(updatePhraseMemoryEntry).toHaveBeenCalledWith({ entry, sourcePhrase: 'Salve amice', targetPhrase: 'Hello' }));
  });
  it('filters only unassigned phrases and searches source and target', async () => {
    vi.mocked(listPhraseMemoryEntries).mockResolvedValue([entry, { ...entry, id: 'other', workspaceId: 'ws-1', sourcePhrase: 'Vale', targetPhrase: 'Bye' }]);
    render(<MemoriesTab />);
    await screen.findByText('Vale');
    await userEvent.selectOptions(screen.getByLabelText('library.workspaceFilter'), 'none');
    await waitFor(() => expect(screen.queryByText('Vale')).not.toBeInTheDocument());
    await userEvent.type(screen.getByRole('searchbox'), 'hello');
    expect(screen.getByText('Salve')).toBeInTheDocument();
  });
});
