import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '../../stores/libraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useProjectStore } from '../../stores/projectStore';
import { DictionariesTab } from './DictionariesTab';
import type { Workspace } from '../../types';

vi.mock('react-i18next', () => { const t = (key: string) => key; return { useTranslation: () => ({ t }) }; });

vi.mock('../../services/glossaryService', () => ({ isGlossaryHome: vi.fn().mockResolvedValue(false), getGlossaryEntries: vi.fn().mockResolvedValue([]) }));
vi.mock('./CsvImportDialog', () => ({ CsvImportDialog: () => null }));
vi.mock('./CopyGlossaryDialog', () => ({ CopyGlossaryDialog: () => null }));
vi.mock('./DictionaryExportDialog', () => ({ DictionaryExportDialog: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const original = useLibraryStore.getState();
const loadGlossaries = vi.fn().mockResolvedValue(undefined);
const loadGlossaryEntries = vi.fn().mockResolvedValue(undefined);
const saveGlossaryEntries = vi.fn().mockResolvedValue(undefined);
const workspace: Workspace = { id: 'guest', name: 'Archivio', iconKey: 'book', embeddingModel: 'text-embedding-3-small',
  memorySearchAllWorkspaces: false, memoryExtractorProvider: 'openai', memoryExtractorModel: 'gpt-5.4-nano', memoryExtractorPrompt: 'Extract',
  ocrDefaultProvider: '', ocrDefaultModel: '', ocrDefaultPrompt: '', createdAt: '2026-10-03' };

describe('Dictionary resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ currentProjectId: null });
    useWorkspaceStore.setState({ activeWorkspace: workspace, workspaces: [workspace] });
    useLibraryStore.setState({ ...original, libraryScope: 'global', expandedGlossaryId: 'dictionary', dirtyIds: [],
      glossaries: [{ id: 'dictionary', name: 'Termini', sourceLanguage: 'la', targetLanguage: 'en', createdAt: '2026-10-03', workspaceId: 'owner' }],
      entriesMap: { dictionary: [{ id: 'term-1', term: 'arma', translation: 'arms', overridden: false }] },
      entriesWorkspaceMap: {}, loadGlossaries, loadGlossaryEntries, saveGlossaryEntries });
  });
  it('shows that global editing changes the shared original and permits editing', async () => {
    render(<DictionariesTab />);
    expect(await screen.findByText('library.sharedOriginal')).toBeInTheDocument();
    expect(screen.getByText('library.linkedWorkspaces')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('pipeline.target 1'), ' changed');
    await userEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(saveGlossaryEntries).toHaveBeenCalledWith('dictionary', null));
  });
  it('shows that a guest workspace edits local corrections and protects existing source terms', async () => {
    useLibraryStore.setState({ libraryScope: 'workspace' });
    render(<DictionariesTab />);
    expect(await screen.findByText('library.localCorrections')).toBeInTheDocument();
    expect(screen.getByText('Archivio')).toBeInTheDocument();
    expect(screen.getByLabelText('pipeline.source 1')).toHaveAttribute('readonly');
    await userEvent.type(screen.getByLabelText('pipeline.target 1'), ' changed');
    await userEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(saveGlossaryEntries).toHaveBeenCalledWith('dictionary', 'guest'));
  });
  it('filters global dictionaries by workspace links while continuing to load original entries', async () => {
    render(<DictionariesTab />);
    await screen.findByText('library.sharedOriginal');
    await userEvent.selectOptions(screen.getByLabelText('library.workspaceFilter'), 'guest');
    await waitFor(() => expect(loadGlossaries).toHaveBeenLastCalledWith('guest'));
    await userEvent.click(screen.getByRole('button', { name: 'Termini' }));
    await waitFor(() => expect(loadGlossaryEntries).toHaveBeenLastCalledWith('dictionary', null));
  });
});
