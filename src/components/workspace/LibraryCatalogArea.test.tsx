import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryCatalogArea } from './LibraryCatalogArea';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import '../../test/i18n-mock';

vi.mock('../../services/libraryService', () => ({
  listLibrarySources: vi.fn().mockResolvedValue([]),
  addSourceToLibrary: vi.fn(),
  getLibrarySourceDetail: vi.fn(),
  setWorkspaceSourceLink: vi.fn(),
}));

describe('LibraryCatalogArea', () => {
  beforeEach(async () => {
    useSourceLibraryStore.setState({ sources: [], detail: null, addingUrls: new Set(), addedManifestUrls: new Set(), error: null });
    useWorkspaceStore.setState({ activeWorkspace: null, workspaces: [] });
    const service = await import('../../services/libraryService');
    // Evita che l'effetto di mount (che ricarica il dettaglio) sovrascriva con
    // `undefined` il fixture impostato dal test — mantiene la stessa forma.
    vi.mocked(service.getLibrarySourceDetail).mockImplementation(
      async () => useSourceLibraryStore.getState().detail ?? undefined as never,
    );
  });

  it('shows the empty state when there are no sources', () => {
    render(<LibraryCatalogArea />);

    expect(screen.getByRole('heading', { name: 'areas.library.title' })).toBeInTheDocument();
    expect(screen.getByText('areas.library.emptyMessage')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('lists persisted sources when present', () => {
    useSourceLibraryStore.setState({
      sources: [{ id: 's1', title: 'Book of Hours', kind: 'iiif', primaryLanguage: null, externalRef: null, createdAt: '2026-01-01' }],
    });

    render(<LibraryCatalogArea />);

    expect(screen.getByText('Book of Hours')).toBeInTheDocument();
    expect(screen.queryByText('areas.library.emptyMessage')).not.toBeInTheDocument();
  });

  it('shows the detail panel when itemId is provided and detail is loaded', () => {
    useSourceLibraryStore.setState({
      detail: {
        source: { id: 's1', title: 'Book of Hours', kind: 'iiif', primaryLanguage: null, externalRef: null, createdAt: '2026-01-01' },
        versions: [{ id: 'v1', sourceId: 's1', label: 'primary', versionKind: 'iiif_manifest', sourceUrl: 'https://x.test/m.json', isPrimary: true, createdAt: '2026-01-01' }],
        assets: [],
        linkedWorkspaceIds: [],
      },
    });

    render(<LibraryCatalogArea itemId="s1" />);

    expect(screen.getByRole('heading', { name: 'Book of Hours' })).toBeInTheDocument();
    expect(screen.getByText('https://x.test/m.json')).toBeInTheDocument();
  });

  it('shows every workspace with its own link toggle, independent from any "active" workspace', async () => {
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'ws-stale', name: 'Stale' } as never,
      workspaces: [
        { id: 'ws-1', name: 'Archivio' } as never,
        { id: 'ws-2', name: 'Ricerca' } as never,
      ],
    });
    useSourceLibraryStore.setState({
      detail: {
        source: { id: 's1', title: 'Book of Hours', kind: 'iiif', primaryLanguage: null, externalRef: null, createdAt: '2026-01-01' },
        versions: [],
        assets: [],
        linkedWorkspaceIds: ['ws-2'],
      },
    });

    render(<LibraryCatalogArea itemId="s1" />);

    const archivioRow = screen.getByText('Archivio').closest('li') as HTMLElement;
    const ricercaRow = screen.getByText('Ricerca').closest('li') as HTMLElement;
    expect(within(archivioRow).getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    expect(within(ricercaRow).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles the link for the clicked workspace only, using that workspace id, never activeWorkspace', async () => {
    const service = await import('../../services/libraryService');
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'ws-stale', name: 'Stale' } as never,
      workspaces: [{ id: 'ws-1', name: 'Archivio' } as never],
    });
    useSourceLibraryStore.setState({
      detail: {
        source: { id: 's1', title: 'Book of Hours', kind: 'iiif', primaryLanguage: null, externalRef: null, createdAt: '2026-01-01' },
        versions: [],
        assets: [],
        linkedWorkspaceIds: [],
      },
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea itemId="s1" />);
    const archivioRow = screen.getByText('Archivio').closest('li') as HTMLElement;
    await user.click(within(archivioRow).getByRole('button'));

    expect(service.setWorkspaceSourceLink).toHaveBeenCalledWith('ws-1', 's1', true);
  });
});
