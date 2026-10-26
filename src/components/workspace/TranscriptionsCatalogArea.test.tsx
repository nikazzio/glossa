import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionsCatalogArea } from './TranscriptionsCatalogArea';
import { listTranscriptionCatalog, type TranscriptionCatalogEntry } from '../../services/transcriptionCatalogService';
import { renameDocument, setDocumentStatus } from '../../services/transcriptionService';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { EMPTY_SOURCE_FIELDS, type LibraryCatalogEntry, type Workspace } from '../../types';
import '../../test/i18n-mock';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));
vi.mock('../../services/transcriptionCatalogService', () => ({ listTranscriptionCatalog: vi.fn() }));
vi.mock('../../services/transcriptionService', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../services/transcriptionService')>(),
  renameDocument: vi.fn().mockResolvedValue(undefined),
  setDocumentStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/iiifProviderService', () => ({
  listIIIFProviders: vi.fn().mockResolvedValue([{ key: 'gallica', label: 'Gallica' }]),
}));
vi.mock('../../stores/confirmStore', () => ({ confirm: vi.fn().mockResolvedValue(true) }));
vi.mock('../transcription/CreateTranscriptionDialog', () => ({ CreateTranscriptionDialog: () => null }));
vi.mock('../common/CachedThumbnail', () => ({
  CachedThumbnail: ({ fallback }: { fallback: React.ReactNode }) => <>{fallback}</>,
}));

function work(): LibraryCatalogEntry {
  return {
    source: {
      id: 'src-1', title: 'Opera nova chiamata duello', kind: 'print', primaryLanguage: 'it',
      externalRef: null, status: 'active', archivedAt: null, createdAt: '2026-01-01 10:00:00',
    },
    versionId: 'v-1', manifestUrl: null, thumbnailUrl: null,
    fields: { ...EMPTY_SOURCE_FIELDS, creator: 'Marozzo, Achille', date: '1536' },
    expectedPages: 310, localPages: 0, localBytes: 0, sizes: [], principalSize: null,
    workspaces: [], providerKey: 'gallica', original: {}, collections: [], stage: 'transcribing',
  };
}

function entry(id: string, title: string, overrides: Partial<TranscriptionCatalogEntry> = {}): TranscriptionCatalogEntry {
  return {
    document: {
      id, source_version_id: 'v-1', workspace_id: 'ws-1', title, status: 'active',
      ocr_provider: null, ocr_model: null, ocr_prompt: null,
    },
    work: work(),
    pagesWithText: 42,
    verifiedPages: 12,
    createdAt: '2026-01-01 10:00:00',
    lastEditedAt: '2026-01-01 10:00:00',
    ...overrides,
  };
}

const catalog = [
  entry('td-1', 'Duello — trascrizione diplomatica'),
  entry('td-2', 'Appunti', { work: null, pagesWithText: 0, verifiedPages: 0 }),
];

describe('TranscriptionsCatalogArea', () => {
  beforeEach(() => {
    vi.mocked(listTranscriptionCatalog).mockResolvedValue(catalog);
    vi.mocked(renameDocument).mockClear();
    vi.mocked(setDocumentStatus).mockClear();
    useUiStore.setState({ transcriptionsView: 'list', transcriptionsGrouping: 'none', location: { area: 'transcriptions' } });
    useWorkspaceStore.setState({ workspaces: [{ id: 'ws-1', name: 'Scherma' } as Workspace] });
  });

  it('shows the transcription name above its work and progress', async () => {
    render(<TranscriptionsCatalogArea />);
    const name = await screen.findByText('Duello — trascrizione diplomatica');
    const row = name.closest('article');
    expect(row).not.toBeNull();
    const scoped = within(row as HTMLElement);
    expect(scoped.getByText('Marozzo, Achille')).toBeInTheDocument();
    expect(scoped.getByText('Opera nova chiamata duello')).toBeInTheDocument();
    expect(scoped.getByText(/Scherma · areas.transcriptions.catalog.pagesWritten/)).toBeInTheDocument();
  });

  it('narrows the list to the chosen shelf', async () => {
    const user = userEvent.setup();
    render(<TranscriptionsCatalogArea />);
    await screen.findByText('Appunti');
    await user.click(screen.getByRole('button', { name: /areas.transcriptions.catalog.shelves.unlinked/ }));
    expect(screen.getByText('Appunti')).toBeInTheDocument();
    expect(screen.queryByText('Duello — trascrizione diplomatica')).not.toBeInTheDocument();
  });

  it('renames a transcription in place', async () => {
    const user = userEvent.setup();
    render(<TranscriptionsCatalogArea />);
    const row = (await screen.findByText('Appunti')).closest('article') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'areas.transcriptions.catalog.rename' }));
    const field = within(row).getByRole('textbox', { name: 'areas.transcriptions.catalog.renameLabel' });
    await user.clear(field);
    await user.type(field, 'Appunti di scherma{Enter}');
    await waitFor(() => expect(renameDocument).toHaveBeenCalledWith('td-2', 'Appunti di scherma'));
  });

  it('archives a transcription from its row', async () => {
    const user = userEvent.setup();
    render(<TranscriptionsCatalogArea />);
    const row = (await screen.findByText('Appunti')).closest('article') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'areas.transcriptions.catalog.archive' }));
    await waitFor(() => expect(setDocumentStatus).toHaveBeenCalledWith('td-2', 'archived'));
  });
});
