import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationsArea } from './TranslationsArea';
import { useProjectStore } from '../../stores/projectStore';
import { useUiStore } from '../../stores/uiStore';
import type { TranslationCatalogEntry } from '../../services/translationCatalogService';
import '../../test/i18n-mock';

const mockListCatalog = vi.fn();
vi.mock('../../services/translationCatalogService', () => ({
  listTranslationCatalog: () => mockListCatalog(),
}));
const mockRenameProject = vi.fn().mockResolvedValue(undefined);
vi.mock('../../services/projectService', () => ({
  renameProject: (id: string, name: string) => mockRenameProject(id, name),
}));
vi.mock('../../stores/projectStore');

const ALPHA: TranslationCatalogEntry = {
  id: 'p1', name: 'Fiore dei Liberi', workspaceId: 'ws-1', workspaceName: 'Alpha',
  sourceLanguage: 'Italian', targetLanguage: 'English', updatedAt: '2026-07-15T10:00:00.000Z',
  chunkCount: 0, translatedChunks: 0, verifiedChunks: 0,
};
const BETA: TranslationCatalogEntry = {
  id: 'p2', name: 'Vadi', workspaceId: 'ws-2', workspaceName: 'Beta',
  sourceLanguage: 'Latin', targetLanguage: 'Italian', updatedAt: '2026-07-14T10:00:00.000Z',
  chunkCount: 4, translatedChunks: 4, verifiedChunks: 4,
};

const mockOpenProjectInWorkspace = vi.fn().mockResolvedValue(undefined);
const mockRemoveProject = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  mockListCatalog.mockResolvedValue([ALPHA, BETA]);
  useUiStore.setState({ location: { area: 'translations' }, translationsView: 'list', translationsGrouping: 'none' });
  vi.mocked(useProjectStore).mockImplementation((selector) => selector({
    openProjectInWorkspace: mockOpenProjectInWorkspace,
    removeProject: mockRemoveProject,
  } as never));
});

describe('TranslationsArea', () => {
  it('lists every translation of every workspace with its languages and workspace', async () => {
    render(<TranslationsArea />);

    const alpha = (await screen.findByText('Fiore dei Liberi')).closest('article');
    const beta = screen.getByText('Vadi').closest('article');
    if (!alpha || !beta) throw new Error('row not found');
    expect(within(alpha).getByText(/Italian → .*English/)).toBeInTheDocument();
    expect(within(alpha).getByText(/Alpha/)).toBeInTheDocument();
    expect(within(beta).getByText(/Beta/)).toBeInTheDocument();
  });

  it('shows on the verified shelf only translations with every segment verified', async () => {
    render(<TranslationsArea />);
    await screen.findByText('Vadi');

    await userEvent.click(screen.getByRole('button', { name: /areas.translations.catalog.shelves.verified/ }));

    expect(screen.queryByText('Fiore dei Liberi')).not.toBeInTheDocument();
    expect(screen.getByText('Vadi')).toBeInTheDocument();
  });

  it('opening a translation delegates to the store, workspace switch included', async () => {
    render(<TranslationsArea />);
    await userEvent.click(await screen.findByText('Vadi'));

    await waitFor(() => expect(mockOpenProjectInWorkspace).toHaveBeenCalledWith('p2', 'ws-2'));
  });

  it('re-enables the rows when opening fails', async () => {
    mockOpenProjectInWorkspace.mockRejectedValueOnce(new Error('boom'));
    render(<TranslationsArea />);
    const name = await screen.findByText('Fiore dei Liberi');

    await userEvent.click(name);

    await waitFor(() => expect(mockOpenProjectInWorkspace).toHaveBeenCalledWith('p1', 'ws-1'));
    await waitFor(() => expect(name.closest('button')).not.toBeDisabled());
  });

  it('renames a translation in place from the row command', async () => {
    render(<TranslationsArea />);
    const row = (await screen.findByText('Vadi')).closest('article');
    if (!row) throw new Error('row not found');

    await userEvent.click(within(row).getByRole('button', { name: 'areas.translations.catalog.rename' }));
    const field = screen.getByRole('textbox', { name: 'areas.translations.catalog.renameLabel' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Vadi, De arte gladiatoria{Enter}');

    await waitFor(() => expect(mockRenameProject).toHaveBeenCalledWith('p2', 'Vadi, De arte gladiatoria'));
  });
});
