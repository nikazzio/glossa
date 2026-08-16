import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifySourceKind, type IIIFDiscoveryResult, type IIIFManifestPreview } from '../types';

vi.mock('../services/libraryService', () => ({
  listLibraryCatalog: vi.fn().mockResolvedValue([]),
  removeSourceFromLibrary: vi.fn().mockResolvedValue(undefined),
  addSourceToLibrary: vi.fn(),
  getLibrarySourceDetail: vi.fn(),
  setWorkspaceSourceLink: vi.fn(),
  listLibrarySourceUrls: vi.fn().mockResolvedValue([]),
}));

const { useSourceLibraryStore } = await import('./sourceLibraryStore');
const service = await import('../services/libraryService');

const manifestCard: IIIFManifestPreview & { id: string } = {
  id: 'https://iiif.example.test/manifest.json',
  manifestUrl: 'https://iiif.example.test/manifest.json',
  title: 'Book of Hours',
  creator: 'Anonimo',
  date: '1450',
  description: null,
  thumbnailUrl: null,
  language: null,
  volume: null,
  subjects: [],
  itemCount: 10,
  materialType: null,
};

describe('sourceLibraryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSourceLibraryStore.setState({ catalog: [], detail: null, addingUrls: new Set(), addedManifestUrls: new Set(), error: null });
  });

  it('addFromDiscovery deriva il payload da un manifest e chiama il service', async () => {
    vi.mocked(service.addSourceToLibrary).mockResolvedValue({ sourceId: 's1', wasCreated: true });
    vi.mocked(service.listLibraryCatalog).mockResolvedValue([]);

    await useSourceLibraryStore.getState().addFromDiscovery(manifestCard, 'ws-1');

    expect(service.addSourceToLibrary).toHaveBeenCalledWith(expect.objectContaining({
      manifestUrl: manifestCard.manifestUrl,
      title: manifestCard.title,
      kind: 'iiif',
      creator: 'Anonimo',
      date: '1450',
      workspaceId: 'ws-1',
    }));
  });

  it('addFromDiscovery segna e rimuove lo stato di caricamento per url', async () => {
    let resolveAdd: (value: { sourceId: string; wasCreated: boolean }) => void = () => {};
    vi.mocked(service.addSourceToLibrary).mockReturnValue(
      new Promise((resolve) => { resolveAdd = resolve; }),
    );

    const pending = useSourceLibraryStore.getState().addFromDiscovery(manifestCard);
    expect(useSourceLibraryStore.getState().addingUrls.has(manifestCard.manifestUrl)).toBe(true);

    resolveAdd({ sourceId: 's1', wasCreated: true });
    await pending;

    expect(useSourceLibraryStore.getState().addingUrls.has(manifestCard.manifestUrl)).toBe(false);
  });

  it('addFromDiscovery imposta un errore leggibile se il service fallisce, senza propagare', async () => {
    vi.mocked(service.addSourceToLibrary).mockRejectedValue(new Error('boom'));

    await useSourceLibraryStore.getState().addFromDiscovery(manifestCard);

    expect(useSourceLibraryStore.getState().error).toBeTruthy();
    expect(useSourceLibraryStore.getState().addingUrls.has(manifestCard.manifestUrl)).toBe(false);
  });

  it('loadDetail popola detail dal service', async () => {
    vi.mocked(service.getLibrarySourceDetail).mockResolvedValue({
      source: { id: 's1', title: 'Titolo', kind: 'iiif', primaryLanguage: null, externalRef: null, createdAt: '2026-01-01' },
      versions: [],
      assets: [],
      linkedWorkspaceIds: [],
    });

    await useSourceLibraryStore.getState().loadDetail('s1');

    expect(useSourceLibraryStore.getState().detail?.source.id).toBe('s1');
  });

  it('toggleWorkspaceLink chiama il service e ricarica il dettaglio se e\' quello aperto', async () => {
    vi.mocked(service.setWorkspaceSourceLink).mockResolvedValue(undefined);
    vi.mocked(service.getLibrarySourceDetail).mockResolvedValue({
      source: { id: 's1', title: 'Titolo', kind: 'iiif', primaryLanguage: null, externalRef: null, createdAt: '2026-01-01' },
      versions: [],
      assets: [],
      linkedWorkspaceIds: ['ws-1'],
    });
    useSourceLibraryStore.setState({
      detail: {
        source: { id: 's1', title: 'Titolo', kind: 'iiif', primaryLanguage: null, externalRef: null, createdAt: '2026-01-01' },
        versions: [],
        assets: [],
        linkedWorkspaceIds: [],
      },
    });

    await useSourceLibraryStore.getState().toggleWorkspaceLink('ws-1', 's1', true);

    expect(service.setWorkspaceSourceLink).toHaveBeenCalledWith('ws-1', 's1', true);
    expect(service.getLibrarySourceDetail).toHaveBeenCalledWith('s1');
    expect(useSourceLibraryStore.getState().detail?.linkedWorkspaceIds).toEqual(['ws-1']);
  });

  it('toggleWorkspaceLink non ricarica nulla se nessun dettaglio e\' aperto', async () => {
    vi.mocked(service.setWorkspaceSourceLink).mockResolvedValue(undefined);

    await useSourceLibraryStore.getState().toggleWorkspaceLink('ws-1', 's-other', true);

    expect(service.getLibrarySourceDetail).not.toHaveBeenCalled();
  });
});

describe('classifySourceKind', () => {
  const resultCard = (overrides: Partial<IIIFDiscoveryResult> = {}): IIIFDiscoveryResult => ({
    id: 'r1',
    title: 'Result',
    creator: null,
    date: null,
    description: null,
    thumbnailUrl: null,
    mediaType: null,
    collection: null,
    language: null,
    volume: null,
    subjects: [],
    itemCount: null,
    manifestUrl: 'https://example.test/r1',
    ...overrides,
  });

  it('riconosce manoscritto da materialType del manifest', () => {
    expect(classifySourceKind({ ...manifestCard, materialType: 'Illuminated manuscript' })).toBe('manuscript');
  });

  it('riconosce manoscritto da subjects anche senza materialType', () => {
    expect(classifySourceKind({ ...manifestCard, materialType: null, subjects: ['manoscritti medievali'] })).toBe('manuscript');
  });

  it('riconosce pdf da mediaType di un risultato di ricerca', () => {
    expect(classifySourceKind(resultCard({ mediaType: 'application/pdf' }))).toBe('pdf');
  });

  it('riconosce stampa da mediaType con parola chiave "print"', () => {
    expect(classifySourceKind(resultCard({ mediaType: 'printed book' }))).toBe('print');
  });

  it('ricade su iiif se nessuna parola chiave nota compare', () => {
    expect(classifySourceKind(resultCard({ mediaType: 'photograph' }))).toBe('iiif');
  });
});
