import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../test/i18n-mock';
import { SourceDiscoveryPanel } from './SourceDiscoveryPanel';
import { useUiStore } from '../../stores/uiStore';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const mockListProviders = vi.fn();
const mockDiscover = vi.fn();

const RESULT_EXTRAS = {
  itemCount: null,
  contributors: [],
  publisher: null,
  rights: [],
  physicalDescription: null,
  holdingInstitution: null,
  catalogUrl: null,
};

vi.mock('../../services/iiifProviderService', () => ({
  listIIIFProviders: () => mockListProviders(),
  discoverIIIF: (...args: unknown[]) => mockDiscover(...args),
}));

vi.mock('../../services/libraryService', () => ({
  listLibraryCatalog: vi.fn().mockResolvedValue([]),
  removeSourceFromLibrary: vi.fn().mockResolvedValue(undefined),
  setSourceArchived: vi.fn().mockResolvedValue(undefined),
  setSourceFieldOverride: vi.fn().mockResolvedValue(undefined),
  addSourceToLibrary: vi.fn().mockResolvedValue({ sourceId: 's1', wasCreated: true }),
  getLibrarySourceDetail: vi.fn(),
  setWorkspaceSourceLink: vi.fn(),
  listLibrarySourceUrls: vi.fn().mockResolvedValue([]),
}));

const PROVIDERS = [
  { key: 'archive_org', label: 'Internet Archive', aliases: [], placeholder: 'Search', isEnabled: true, resolver: 'archive_org', searchHandler: 'archive_org', searchMode: 'search_first', supportsDirectResolution: true, supportsSearch: true, filters: [] },
];

describe('SourceDiscoveryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ discoveryResultsPerRow: 3 });
    useSourceLibraryStore.setState({ catalog: [], detail: null, addingUrls: new Set(), addedManifestUrls: new Set(), error: null });
    useWorkspaceStore.setState({ activeWorkspace: null, workspaces: [] });
    mockListProviders.mockResolvedValue(PROVIDERS);
  });

  it('shows a distinct error when discovery fails', async () => {
    mockDiscover.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('dashboard.discovery.searchFailed');
    expect(screen.queryByText('dashboard.discovery.notFound')).not.toBeInTheDocument();
  });

  it('uses a native button to expand one result at a time', async () => {
    mockDiscover.mockResolvedValueOnce({
      status: 'results', providerKey: 'archive_org', manifest: null, hasMore: false,
      results: [
        { id: 'one', title: 'First source', creator: null, date: null, description: null, thumbnailUrl: null, mediaType: null, collection: null, language: null, volume: null, subjects: [], ...RESULT_EXTRAS, manifestUrl: 'https://example.test/one' },
        { id: 'two', title: 'Second source', creator: null, date: null, description: null, thumbnailUrl: null, mediaType: null, collection: null, language: null, volume: null, subjects: [], ...RESULT_EXTRAS, manifestUrl: 'https://example.test/two' },
      ],
    });
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));
    const first = await screen.findByRole('button', { name: /First source/ });
    const second = screen.getByRole('button', { name: /Second source/ });

    await user.click(first);
    await waitFor(() => expect(first).toHaveAttribute('aria-expanded', 'true'));
    await user.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows every metadata field when a list row expands, not just title and author', async () => {
    useUiStore.setState({ discoveryResultsPerRow: 'list' });
    mockDiscover.mockResolvedValueOnce({
      status: 'results', providerKey: 'gallica', manifest: null, hasMore: false,
      results: [{
        id: 'bpt6k3282120', title: 'Le guidon des capitaines', creator: 'Strozzi, Filippo', date: '1610',
        description: null, thumbnailUrl: null, mediaType: null, collection: null, language: 'fre', volume: null,
        subjects: [], itemCount: null,
        contributors: ['Cavalcabo, Girolamo', 'Villamont, Jacques de. Traducteur'],
        publisher: 'Claude Le Villain (Rouen)',
        rights: ['domaine public'],
        physicalDescription: '23-[1 bl.] p. ; in-12',
        holdingInstitution: 'Bibliothèque nationale de France, V-22944',
        catalogUrl: 'http://catalogue.bnf.fr/ark:/12148/cb33412414z',
        manifestUrl: 'https://gallica.bnf.fr/iiif/ark:/12148/bpt6k3282120/manifest.json',
      }],
    });
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'cavalcabo');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));
    await user.click(await screen.findByRole('button', { name: /Le guidon des capitaines/ }));

    expect(screen.getByText('Cavalcabo, Girolamo · Villamont, Jacques de. Traducteur')).toBeInTheDocument();
    expect(screen.getByText('Claude Le Villain (Rouen)')).toBeInTheDocument();
    expect(screen.getByText('domaine public')).toBeInTheDocument();
    expect(screen.getByText('23-[1 bl.] p. ; in-12')).toBeInTheDocument();
    expect(screen.getByText('Bibliothèque nationale de France, V-22944')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cb33412414z/ })).toHaveAttribute(
      'href',
      'http://catalogue.bnf.fr/ark:/12148/cb33412414z',
    );
  });

  it('adds a result to the library and then shows it as already added', async () => {
    const libraryService = await import('../../services/libraryService');
    mockDiscover.mockResolvedValueOnce({
      status: 'results', providerKey: 'archive_org', manifest: null, hasMore: false,
      results: [
        { id: 'one', title: 'First source', creator: null, date: null, description: null, thumbnailUrl: null, mediaType: null, collection: null, language: null, volume: null, subjects: [], ...RESULT_EXTRAS, manifestUrl: 'https://example.test/one' },
      ],
    });
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));
    await screen.findByRole('button', { name: /First source/ });

    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.addToLibrary' }));

    expect(libraryService.addSourceToLibrary).toHaveBeenCalledWith(expect.objectContaining({
      manifestUrl: 'https://example.test/one',
      title: 'First source',
    }));
    expect(await screen.findByRole('button', { name: 'dashboard.discovery.alreadyInLibrary' })).toBeDisabled();
  });

  it('never links a workspace when adding via the plain library button (dashboard has no active workspace)', async () => {
    const libraryService = await import('../../services/libraryService');
    useWorkspaceStore.setState({ activeWorkspace: { id: 'ws-stale', name: 'Stale' } as never, workspaces: [] });
    mockDiscover.mockResolvedValueOnce({
      status: 'results', providerKey: 'archive_org', manifest: null, hasMore: false,
      results: [
        { id: 'one', title: 'First source', creator: null, date: null, description: null, thumbnailUrl: null, mediaType: null, collection: null, language: null, volume: null, subjects: [], ...RESULT_EXTRAS, manifestUrl: 'https://example.test/one' },
      ],
    });
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));
    await screen.findByRole('button', { name: /First source/ });
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.addToLibrary' }));

    expect(vi.mocked(libraryService.addSourceToLibrary).mock.calls[0][0].workspaceId).toBeUndefined();
  });

  it('links a chosen workspace via the "add to workspace" picker', async () => {
    const libraryService = await import('../../services/libraryService');
    useWorkspaceStore.setState({ activeWorkspace: null, workspaces: [{ id: 'ws-1', name: 'Archivio' } as never] });
    mockDiscover.mockResolvedValueOnce({
      status: 'results', providerKey: 'archive_org', manifest: null, hasMore: false,
      results: [
        { id: 'one', title: 'First source', creator: null, date: null, description: null, thumbnailUrl: null, mediaType: null, collection: null, language: null, volume: null, subjects: [], ...RESULT_EXTRAS, manifestUrl: 'https://example.test/one' },
      ],
    });
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'Fiore');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));
    await screen.findByRole('button', { name: /First source/ });
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.addToWorkspace' }));
    await user.click(await screen.findByRole('button', { name: 'Archivio' }));

    expect(libraryService.addSourceToLibrary).toHaveBeenCalledWith(expect.objectContaining({
      manifestUrl: 'https://example.test/one',
      workspaceId: 'ws-1',
    }));
  });
});

describe('risultati doppi dai cataloghi', () => {
  const card = (id: string, title: string) => ({
    id,
    title,
    creator: null,
    date: null,
    description: null,
    thumbnailUrl: null,
    mediaType: null,
    collection: null,
    language: null,
    volume: null,
    subjects: [],
    ...RESULT_EXTRAS,
    manifestUrl: `https://example.test/${id}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ discoveryResultsPerRow: 3 });
    useSourceLibraryStore.setState({ catalog: [], detail: null, addingUrls: new Set(), addedManifestUrls: new Set(), error: null });
    useWorkspaceStore.setState({ activeWorkspace: null, workspaces: [] });
    mockListProviders.mockResolvedValue(PROVIDERS);
  });

  it('lo stesso identificativo su due pagine non produce due schede', async () => {
    // Internet Archive rimanda lo stesso identificativo su pagine diverse:
    // concatenare e basta duplicava la scheda, e con lei la sua chiave.
    mockDiscover.mockResolvedValueOnce({
      status: 'results', providerKey: 'archive_org', manifest: null, hasMore: true,
      results: [card('ripetuto', 'Diari')],
    });
    mockDiscover.mockResolvedValueOnce({
      status: 'results', providerKey: 'archive_org', manifest: null, hasMore: false,
      results: [card('ripetuto', 'Diari'), card('nuovo', 'Altro')],
    });
    const user = userEvent.setup();
    render(<SourceDiscoveryPanel />);

    await user.type(await screen.findByRole('textbox'), 'diari');
    await user.click(screen.getByRole('button', { name: 'dashboard.discovery.submit' }));
    await user.click(await screen.findByRole('button', { name: 'dashboard.discovery.loadMore' }));

    await waitFor(() => expect(screen.getAllByText('Diari')).toHaveLength(1));
    expect(screen.getByText('Altro')).toBeInTheDocument();
  });
});
