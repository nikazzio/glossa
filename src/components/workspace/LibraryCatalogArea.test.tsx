import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryCatalogArea } from './LibraryCatalogArea';
import { deleteVersionFiles } from '../../services/vaultService';
import { toast } from 'sonner';
import { useSourceLibraryStore } from '../../stores/sourceLibraryStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUiStore } from '../../stores/uiStore';
import { useJobsStore } from '../../stores/jobsStore';
import { confirm } from '../../stores/confirmStore';
import { EMPTY_LIBRARY_FILTERS } from '../../utils/libraryCatalogFilters';
import { enqueueOptimization } from '../../services/optimizeService';
import '../../test/i18n-mock';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../services/libraryService', () => ({
  listLibraryCatalog: vi.fn().mockResolvedValue([]),
  removeSourceFromLibrary: vi.fn().mockResolvedValue(undefined),
  setSourceArchived: vi.fn().mockResolvedValue(undefined),
  setSourceFieldOverride: vi.fn().mockResolvedValue(undefined),
  listLibrarySourceUrls: vi.fn().mockResolvedValue([]),
  // Nessun file registrato: la chiave viene dai metadati, come per una fonte
  // appena aggiunta.
  versionProviderKey: vi.fn().mockResolvedValue(null),
  addSourceToLibrary: vi.fn(),
  getLibrarySourceDetail: vi.fn(),
  setWorkspaceSourceLink: vi.fn(),
}));

// L'inventario del deposito passa dal motore: nelle prove non c'è, e la scheda
// deve reggere la risposta «niente sul disco».
vi.mock('../../services/inventoryService', () => ({
  versionInventory: vi.fn().mockResolvedValue(null),
  libraryInventory: vi.fn().mockResolvedValue([]),
}));

// La conferma vive in un componente montato altrove: qui si dà per data,
// perché la prova riguarda cosa succede dopo il sì.
vi.mock('../../stores/confirmStore', () => ({ confirm: vi.fn().mockResolvedValue(true) }));

vi.mock('../../services/vaultService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/vaultService')>();
  return {
    ...actual,
    deleteVersionFiles: vi.fn().mockResolvedValue({ deletedFiles: 3, freedBytes: 8_200_000 }),
    freeVersionPages: vi.fn().mockResolvedValue({ deletedFiles: 0, freedBytes: 0 }),
  };
});

vi.mock('../../services/jobsService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/jobsService')>();
  return { ...actual, enqueueSourceDownload: vi.fn() };
});

vi.mock('../../services/optimizeService', () => ({
  enqueueOptimization: vi.fn(),
  getOptimizeLongEdge: vi.fn().mockResolvedValue(2000),
  getOptimizeQuality: vi.fn().mockResolvedValue(82),
  OPTIMIZE_LONG_EDGES: [1000, 1500, 2000, 3000, 4000],
  OPTIMIZE_QUALITIES: [60, 70, 82, 90],
}));

vi.mock('../../services/libraryCollectionsService', () => ({
  listCollections: vi.fn().mockResolvedValue([{ id: 'coll-1', name: 'Codici', createdAt: '2026-08-01' }]),
  createCollection: vi.fn().mockResolvedValue({ id: 'coll-2', name: 'Nuova', createdAt: '2026-08-30' }),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
  setSourceCollection: vi.fn().mockResolvedValue(undefined),
  collectionsOfMany: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../../services/librarySavedViewsService', () => ({
  listSavedViews: vi.fn().mockResolvedValue([]),
  saveView: vi.fn().mockResolvedValue(undefined),
  deleteSavedView: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/iiifProviderService', () => ({
  listIIIFProviders: vi.fn().mockResolvedValue([]),
}));

const EMPTY_DETAIL_METADATA = {
  language: null,
  subjects: [],
  publisher: null,
  volume: null,
  contributors: [],
  rights: [],
  physicalDescription: null,
  holdingInstitution: null,
  catalogUrl: null,
  pageUrl: null,
  description: null,
  providerKey: null,
  originPlace: null,
  provenance: [],
  notes: null,
  series: null,
  genreForm: [],
  standardIdentifier: null,
  coverage: [],
  relatedWorks: [],
};

const entry = (
  overrides: Partial<import('../../types').LibraryCatalogEntry> = {},
): import('../../types').LibraryCatalogEntry => ({
  source: {
    id: 's1',
    title: 'Book of Hours',
    kind: 'iiif' as const,
    primaryLanguage: null,
    // Provenienza completa: chiave della biblioteca **e** identificativo. Non è
    // un nome di cartella, e passarla come tale faceva fallire lo scaricamento.
    externalRef: 'gallica:btv1b8426',
    status: 'active' as const,
    archivedAt: null,
    createdAt: '2026-01-01',
  },
  versionId: 'v1',
  manifestUrl: 'https://x.test/m.json',
  thumbnailUrl: null,
  creator: null,
  date: null,
  expectedPages: 210,
  localPages: 0,
  localBytes: 0,
  sizes: [],
  principalSize: null,
  workspaces: [],
  original: {},
  collections: [],
  providerKey: 'gallica',
  ...overrides,
});

/** Scarica/verifica/ottimizza/libera spazio vivono nel menu "···" della riga:
 *  vanno aperti prima di poterci cliccare o leggerne lo stato. */
const openRowMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: 'areas.library.moreActions' }));

/** Le tendine dei filtri (natura, lingua, biblioteca, disponibilità,
 *  workspace, collezione, ordinamento) e "mostra archiviate" stanno in una
 *  riga a scomparsa, chiusa di default. */
const openFilters = () =>
  fireEvent.click(screen.getByRole('button', { name: 'areas.library.filters.toggleFilters' }));

describe('LibraryCatalogArea', () => {
  beforeEach(async () => {
    // Le chiamate registrate si azzerano fra un caso e l'altro: senza, una
    // chiamata identica fatta dal caso precedente farebbe passare
    // un'asserzione anche se in questo caso non è successo niente.
    vi.clearAllMocks();
    vi.mocked(confirm).mockResolvedValue(true);
    vi.mocked(deleteVersionFiles).mockResolvedValue({ deletedFiles: 3, freedBytes: 8_200_000 });
    vi.mocked(enqueueOptimization).mockReset();
    useSourceLibraryStore.setState({ catalog: [], detail: null, addingUrls: new Set(), addedManifestUrls: new Set(), error: null });
    useWorkspaceStore.setState({ activeWorkspace: null, workspaces: [] });
    // La coda è globale: un lavoro lasciato da un altro test farebbe comparire
    // la percentuale al posto del pulsante.
    useJobsStore.setState({ jobs: [] });
    // Anche la posizione è globale: senza riportarla al catalogo, un test
    // erediterebbe la scheda aperta da quello prima.
    useUiStore.setState({ location: { area: 'library' } });
    const service = await import('../../services/libraryService');
    // Evita che l'effetto di mount (che ricarica dettaglio e catalogo)
    // sovrascriva il fixture impostato dal test — mantiene la stessa forma.
    vi.mocked(service.getLibrarySourceDetail).mockImplementation(
      async () => useSourceLibraryStore.getState().detail ?? undefined as never,
    );
    vi.mocked(service.listLibraryCatalog).mockImplementation(
      async () => useSourceLibraryStore.getState().catalog,
    );
  });

  it('senza fonti spiega cosa comparirà lì', () => {
    render(<LibraryCatalogArea />);

    expect(screen.getByText('areas.library.empty')).toBeInTheDocument();
  });

  it('elenca le fonti con quante pagine sono davvero sul computer', () => {
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 34 })] });

    render(<LibraryCatalogArea />);

    expect(screen.getByText('Book of Hours')).toBeInTheDocument();
    expect(screen.getByText(/areas\.library\.availabilityPartial/)).toBeInTheDocument();
  });

  it('un libro completo per quanto la biblioteca serve non è chiamato incompleto', () => {
    // 308 sul disco su 328 dichiarate, venti che il server non ha mai servito:
    // non è un lavoro a metà, e riscaricarle non le farebbe comparire.
    useSourceLibraryStore.setState({
      catalog: [
        entry({
          localPages: 308,
          expectedPages: 328,
          principalSize: '2000',
          sizes: [{ sizeTag: '2000', pages: 308, bytes: 1_000, missing: 20, derived: false }],
        }),
      ],
    });

    render(<LibraryCatalogArea />);

    expect(screen.getByText(/areas\.library\.availabilityComplete/)).toBeInTheDocument();
  });

  it('accoda subito l’ottimizzazione e mostra il lavoro', async () => {
    vi.mocked(enqueueOptimization).mockResolvedValue({
      id: 'optimize:v1:2000',
      jobType: 'image_optimization',
      status: 'queued',
      priority: 5,
    } as never);
    useSourceLibraryStore.setState({
      catalog: [entry({
        localPages: 34,
        localBytes: 48_234_496,
        principalSize: '2000',
        sizes: [{ sizeTag: '2000', pages: 34, bytes: 48_234_496, missing: 0, derived: false }],
      })],
    });

    render(<LibraryCatalogArea />);
    openRowMenu();
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.optimizeAction' }));

    await waitFor(() => expect(enqueueOptimization).toHaveBeenCalledWith('v1', '2000'));
    expect(useJobsStore.getState().jobs).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'optimize:v1:2000' })]),
    );
  });

  it('le pagine rifiutate di un altra misura non fanno sembrare completo un libro che non lo è', () => {
    // Capita a chi ha scaricato lo stesso libro due volte con tetti diversi: le
    // venti rifiutate stanno nella cartella `max`, e il conteggio a cui vengono
    // confrontate è quello della misura principale.
    useSourceLibraryStore.setState({
      catalog: [
        entry({
          localPages: 308,
          expectedPages: 328,
          principalSize: '2000',
          sizes: [
            { sizeTag: '2000', pages: 308, bytes: 1_000, missing: 0, derived: false },
            { sizeTag: 'max', pages: 3, bytes: 900, missing: 20, derived: false },
          ],
        }),
      ],
    });

    render(<LibraryCatalogArea />);

    expect(screen.getByText(/areas\.library\.availabilityPartial/)).toBeInTheDocument();
  });

  it('le pagine prese a risoluzione piena sono un aggiunta, non un buco', () => {
    useSourceLibraryStore.setState({
      catalog: [
        entry({
          localPages: 328,
          expectedPages: 328,
          principalSize: '2000',
          sizes: [
            { sizeTag: '2000', pages: 328, bytes: 1_000, missing: 0, derived: false },
            { sizeTag: 'max', pages: 3, bytes: 900, missing: 0, derived: false },
          ],
        }),
      ],
    });

    render(<LibraryCatalogArea />);

    expect(screen.getByText(/areas\.library\.extraFullSize/)).toBeInTheDocument();
    expect(screen.getByText(/areas\.library\.availabilityComplete/)).toBeInTheDocument();
  });

  it('due misure con lo stesso numero di pagine non rendono casuale quale sia la principale', () => {
    // Lo stesso libro scaricato due volte con tetti diversi. Quale sia la
    // principale lo dichiara il deposito: senza quel dato, confrontare i
    // conteggi qui sceglierebbe la prima delle due e l'altra diventerebbe
    // «un'aggiunta» — ma l'aggiunta va detta una volta, non a caso.
    useSourceLibraryStore.setState({
      catalog: [
        entry({
          localPages: 328,
          expectedPages: 328,
          principalSize: 'max',
          sizes: [
            { sizeTag: '2000', pages: 328, bytes: 1_000, missing: 0, derived: false },
            { sizeTag: 'max', pages: 328, bytes: 3_000, missing: 0, derived: false },
          ],
        }),
      ],
    });

    render(<LibraryCatalogArea />);

    // L'aggiunta è la cartella `2000`, cioè quella che **non** è principale.
    expect(screen.getByText(/areas\.library\.extraFullSize/)).toBeInTheDocument();
  });

  it('dice quante pagine ha l opera senza doverla aprire', () => {
    // È il dato con cui si decide se scaricarla o no.
    useSourceLibraryStore.setState({ catalog: [entry({ expectedPages: 210 })] });

    render(<LibraryCatalogArea />);

    expect(screen.getByText(/areas\.library\.pageCount/)).toBeInTheDocument();
  });

  it('senza un numero di pagine dichiarato non se ne inventa uno', () => {
    useSourceLibraryStore.setState({ catalog: [entry({ expectedPages: null })] });

    render(<LibraryCatalogArea />);

    expect(screen.queryByText(/areas\.library\.pageCount/)).not.toBeInTheDocument();
  });

  it('togliendo un opera si eliminano anche le sue immagini', async () => {
    // Lasciarle dietro produceva cartelle che nessuna schermata sa mostrare, e
    // che riaggiungendo la stessa opera non tornerebbero comunque utili.
    const user = userEvent.setup();
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 34, localBytes: 8_200_000 })] });
    render(<LibraryCatalogArea />);

    await user.click(screen.getByRole('button', { name: 'areas.library.remove' }));

    await waitFor(() =>
      expect(vi.mocked(deleteVersionFiles)).toHaveBeenCalledWith('gallica', 'v1'),
    );
  });

  it('non rimuove i file mentre un lavoro li sta modificando', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteVersionFiles).mockRejectedValue(new Error('version_work_in_progress'));
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 34 })] });
    render(<LibraryCatalogArea />);

    await user.click(screen.getByRole('button', { name: 'areas.library.remove' }));

    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('areas.library.filesBusy'));
  });

  it('archivia l opera senza toccare i file quando non ce ne sono sul computer', async () => {
    const service = await import('../../services/libraryService');
    const { freeVersionPages } = await import('../../services/vaultService');
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 0, localBytes: 0 })] });

    render(<LibraryCatalogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.archive' }));

    await waitFor(() => expect(service.setSourceArchived).toHaveBeenCalledWith('s1', true));
    expect(freeVersionPages).not.toHaveBeenCalled();
  });

  const conPagineSulComputer = () =>
    entry({
      localPages: 34,
      localBytes: 48_234_496,
      principalSize: '2000',
      sizes: [{ sizeTag: '2000', pages: 34, bytes: 48_234_496, missing: 0, derived: false }],
    });

  it('dopo aver archiviato propone di liberare lo spazio, e accettando lo libera', async () => {
    const service = await import('../../services/libraryService');
    const { freeVersionPages } = await import('../../services/vaultService');
    useSourceLibraryStore.setState({ catalog: [conPagineSulComputer()] });

    render(<LibraryCatalogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.archive' }));

    await waitFor(() => expect(service.setSourceArchived).toHaveBeenCalledWith('s1', true));
    await waitFor(() => expect(freeVersionPages).toHaveBeenCalled());
  });

  it('rifiutando la proposta, l opera resta archiviata e le pagine restano dove sono', async () => {
    const service = await import('../../services/libraryService');
    const { freeVersionPages } = await import('../../services/vaultService');
    vi.mocked(confirm).mockResolvedValue(false);
    useSourceLibraryStore.setState({ catalog: [conPagineSulComputer()] });

    render(<LibraryCatalogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.archive' }));

    await waitFor(() => expect(service.setSourceArchived).toHaveBeenCalledWith('s1', true));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(freeVersionPages).not.toHaveBeenCalled();
  });

  it('un opera archiviata offre di riportarla in catalogo, non di archiviarla di nuovo', async () => {
    const service = await import('../../services/libraryService');
    useSourceLibraryStore.setState({
      catalog: [
        entry({ source: { ...entry().source, status: 'archived', archivedAt: '2026-08-30' } }),
      ],
    });

    render(<LibraryCatalogArea />);
    // Di default le archiviate non si vedono: si accende il filtro.
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.filters.showArchived' }));
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.restore' }));

    await waitFor(() => expect(service.setSourceArchived).toHaveBeenCalledWith('s1', false));
  });

  it('le opere archiviate stanno fuori dall elenco finché non si chiede di vederle', () => {
    useSourceLibraryStore.setState({
      catalog: [
        entry({ source: { ...entry().source, status: 'archived', archivedAt: '2026-08-30' } }),
      ],
    });

    render(<LibraryCatalogArea />);

    expect(screen.queryByText('Book of Hours')).not.toBeInTheDocument();
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.filters.showArchived' }));
    expect(screen.getByText('Book of Hours')).toBeInTheDocument();
  });

  it('offre lo scaricamento e la rimozione per ogni fonte', () => {
    useSourceLibraryStore.setState({ catalog: [entry()] });

    render(<LibraryCatalogArea />);
    openRowMenu();

    expect(screen.getByRole('button', { name: 'areas.library.download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'areas.library.remove' })).toBeInTheDocument();
  });

  it('cliccando scarica mette in coda un lavoro con la chiave della biblioteca', async () => {
    // La chiave deve essere quella del registro (`gallica`), non la provenienza
    // completa `gallica:btv1b8426`: come nome di cartella verrebbe rifiutata e
    // il lavoro fallirebbe subito, senza scaricare niente.
    const { enqueueSourceDownload } = await import('../../services/jobsService');
    vi.mocked(enqueueSourceDownload).mockResolvedValue({ id: 'download:v1' } as never);
    useSourceLibraryStore.setState({ catalog: [entry()] });

    render(<LibraryCatalogArea />);
    openRowMenu();
    // I comandi icona vivono dentro un tooltip: con userEvent il clic non
    // arriva al bottone in jsdom, come già visto nella testata.
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.download' }));

    await waitFor(() =>
      expect(enqueueSourceDownload).toHaveBeenCalledWith({
        providerKey: 'gallica',
        manifestUrl: 'https://x.test/m.json',
        versionId: 'v1',
      }),
    );
  });

  it('una fonte senza chiave della biblioteca usa il profilo prudente', async () => {
    // Nessuna fonte resta senza politica di rete: `generic` è nel
    // registro e porta il profilo prudente.
    const { enqueueSourceDownload } = await import('../../services/jobsService');
    vi.mocked(enqueueSourceDownload).mockResolvedValue({ id: 'download:v1' } as never);
    useSourceLibraryStore.setState({ catalog: [entry({ providerKey: null })] });

    render(<LibraryCatalogArea />);
    openRowMenu();
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.download' }));

    await waitFor(() =>
      expect(enqueueSourceDownload).toHaveBeenCalledWith(
        expect.objectContaining({ providerKey: 'generic' }),
      ),
    );
  });

  it('una fonte tutta sul computer non offre di riscaricarla', async () => {
    // Riscaricare quello che c'è già è un quarto d'ora di rete per niente. Il
    // comando però non sparisce: resta al suo posto, disattivato, con accanto
    // il segno che è a posto.
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 210 })] });

    render(<LibraryCatalogArea />);
    openRowMenu();

    expect(screen.getByRole('button', { name: 'areas.library.download' })).toBeDisabled();
    expect(screen.getByLabelText('areas.library.availabilityComplete')).toBeInTheDocument();
  });

  it('verifica e libera spazio ci sono sempre, spenti quando non c\u2019è niente in locale', () => {
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 0 })] });

    render(<LibraryCatalogArea />);
    openRowMenu();

    expect(screen.getByRole('button', { name: 'areas.library.verify' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'areas.library.freeSpace' })).toBeDisabled();
  });

  it('con pagine sul computer verifica e libera spazio si accendono', () => {
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 34, localBytes: 48_234_496 })] });

    render(<LibraryCatalogArea />);
    openRowMenu();

    expect(screen.getByRole('button', { name: 'areas.library.verify' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'areas.library.freeSpace' })).toBeEnabled();
  });

  it('mostra tutte le opere, con i workspace a cui appartengono', async () => {
    // La Biblioteca è un catalogo: filtrarla su un workspace nascondeva libri
    // che ci sono (#213).
    useWorkspaceStore.setState({
      workspaces: [
        {
          id: 'ws1', name: 'Scherma', iconKey: 'book', embeddingModel: 'text-embedding-3-small',
          memoryExtractorProvider: 'openai', memoryExtractorModel: 'm', memoryExtractorPrompt: 'p',
          createdAt: '2026-08-01',
        },
      ],
      activeWorkspace: null,
    });
    useSourceLibraryStore.setState({
      catalog: [
        entry({ workspaces: [{ workspaceId: 'ws1', workspaceName: 'Scherma', isOrigin: false }] }),
      ],
    });

    render(<LibraryCatalogArea />);

    // Il nome compare anche fra le scelte del filtro workspace: qui interessa
    // l'etichetta sulla riga dell'opera.
    expect(screen.getByText('Scherma')).toBeInTheDocument();
  });

  it('scollega un opera premendo la X sul workspace su cui sta', async () => {
    const user = userEvent.setup();
    const service = await import('../../services/libraryService');
    useWorkspaceStore.setState({ workspaces: [], activeWorkspace: null });
    useSourceLibraryStore.setState({
      catalog: [
        entry({ workspaces: [{ workspaceId: 'ws1', workspaceName: 'Scherma', isOrigin: false }] }),
      ],
    });

    render(<LibraryCatalogArea />);
    await user.click(screen.getByRole('button', { name: 'areas.library.unlinkFromWorkspace' }));

    await waitFor(() =>
      expect(vi.mocked(service.setWorkspaceSourceLink)).toHaveBeenCalledWith('ws1', 's1', false),
    );
  });

  it('si può passare dall’elenco alla griglia', () => {
    useSourceLibraryStore.setState({ catalog: [entry()] });

    render(<LibraryCatalogArea />);
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.viewGrid' }));

    expect(useUiStore.getState().libraryView).toBe('grid');
  });

  it('cliccando il titolo si apre la scheda dell opera, non un pannello a lato', async () => {
    useSourceLibraryStore.setState({ catalog: [entry()] });

    render(<LibraryCatalogArea />);
    fireEvent.click(screen.getByRole('button', { name: /Book of Hours/ }));

    await waitFor(() =>
      expect(useUiStore.getState().location).toEqual({ area: 'library', itemId: 's1' }),
    );
  });

  it('la scheda mostra dati, comandi e il posto del futuro visore, e si torna al catalogo', async () => {
    useSourceLibraryStore.setState({
      catalog: [entry({ localPages: 34, localBytes: 48_234_496 })],
      detail: {
        source: entry().source,
        versions: [
          {
            id: 'v1',
            sourceId: 's1',
            label: 'primary',
            versionKind: 'iiif_manifest',
            sourceUrl: 'https://x.test/m.json',
            isPrimary: true,
            createdAt: '2026-01-01',
            expectedPages: null,
            providerKey: null,
          },
        ],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });

    const user = userEvent.setup();
    render(<LibraryCatalogArea itemId="s1" />);

    // Il titolo compare due volte apposta: nell'intestazione della colonna
    // (resta in vista cambiando tab) e nel campo titolo correggibile.
    expect(screen.getAllByText('Book of Hours').length).toBeGreaterThan(0);
    // Un manifesto IIIF è dichiarato: il visore prova ad aprirlo davvero
    // (non più il segnaposto), e qui — dove `invoke` è un mock senza
    // risposta — arriva legittimamente all'errore controllato.
    expect(await screen.findByText('areas.library.viewerLoadError')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'areas.library.copiesTab' }));
    expect(screen.getByRole('button', { name: 'areas.library.freeSpace' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'areas.library.moreActions' }));
    expect(await screen.findByRole('button', { name: 'areas.library.archive' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'areas.library.backToCatalogue' }));
    await waitFor(() => expect(useUiStore.getState().location).toEqual({ area: 'library' }));
  });

  it('la scheda mostra la fonte con identificativo pulito e link veri', async () => {
    const iiifService = await import('../../services/iiifProviderService');
    vi.mocked(iiifService.listIIIFProviders).mockResolvedValueOnce([
      { key: 'gallica', label: 'Gallica', aliases: [], placeholder: '', isEnabled: true, resolver: 'gallica', searchHandler: 'gallica', searchMode: 'search_first', supportsDirectResolution: true, supportsSearch: true, filters: [] },
    ] as never);
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: { ...entry().source, externalRef: 'gallica:btv1b8426' },
        versions: [],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
        holdingInstitution: 'Bibliothèque nationale de France',
        pageUrl: 'https://gallica.bnf.fr/ark:/12148/btv1b8426',
        catalogUrl: 'http://catalogue.bnf.fr/ark:/12148/cb1234',
        providerKey: 'gallica',
        description: 'Manoscritto miniato.',
      },
    });

    render(<LibraryCatalogArea itemId="s1" />);

    expect(screen.getByText('areas.library.sourceSection')).toBeInTheDocument();
    expect(await screen.findByText('Gallica')).toBeInTheDocument();
    expect(screen.getByText('btv1b8426')).toBeInTheDocument();
    expect(screen.getByText('Bibliothèque nationale de France')).toBeInTheDocument();
    expect(screen.getByText('Manoscritto miniato.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://gallica.bnf.fr/ark:/12148/btv1b8426' })).toHaveAttribute(
      'href',
      'https://gallica.bnf.fr/ark:/12148/btv1b8426',
    );
    expect(screen.getByRole('link', { name: 'http://catalogue.bnf.fr/ark:/12148/cb1234' })).toHaveAttribute(
      'href',
      'http://catalogue.bnf.fr/ark:/12148/cb1234',
    );
  });

  it('la scheda elenca le risoluzioni scaricate per ogni copia', async () => {
    useSourceLibraryStore.setState({
      catalog: [
        entry({
          localPages: 40,
          sizes: [
            { sizeTag: '1500', pages: 40, bytes: 40_000_000, missing: 0, derived: false },
            { sizeTag: 'full', pages: 10, bytes: 60_000_000, missing: 2, derived: false },
          ],
          principalSize: '1500',
        }),
      ],
      detail: {
        source: entry().source,
        versions: [
          {
            id: 'v1',
            sourceId: 's1',
            label: 'primary',
            versionKind: 'iiif_manifest',
            sourceUrl: 'https://x.test/m.json',
            isPrimary: true,
            createdAt: '2026-01-01',
            expectedPages: null,
            providerKey: null,
          },
        ],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });

    const user = userEvent.setup();
    render(<LibraryCatalogArea itemId="s1" />);
    await user.click(screen.getByRole('tab', { name: 'areas.library.copiesTab' }));

    const resolutionsList = screen.getByText('areas.library.resolutionsSection').nextElementSibling as HTMLElement;
    // "1500" è numerica: l'etichetta aggiunge l'unità di misura tramite una
    // chiave tradotta (il mock i18n dei test non interpola i placeholder,
    // quindi qui si legge la chiave, non "1500 pixel"). "full" non è
    // numerica: resta il valore così com'è, senza inventarsi un'unità.
    expect(resolutionsList).toHaveTextContent('settings.download.pixels');
    expect(resolutionsList).toHaveTextContent('full');
    // Solo la principale porta il segno: è quanto conta verificare, non il
    // testo del riepilogo (il mock i18n dei test non interpola i placeholder).
    expect(resolutionsList).toHaveTextContent('areas.library.resolutionPrincipal');
  });

  it('dalla scheda, rimuovere riporta al catalogo solo dopo che l opera è sparita', async () => {
    const service = await import('../../services/libraryService');
    let posizioneDuranteLaRimozione: unknown = null;
    vi.mocked(service.removeSourceFromLibrary).mockImplementationOnce(async () => {
      posizioneDuranteLaRimozione = useUiStore.getState().location;
    });
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });

    useUiStore.setState({ location: { area: 'library', itemId: 's1' } });

    const user = userEvent.setup();
    render(<LibraryCatalogArea itemId="s1" />);
    await user.click(screen.getByRole('button', { name: 'areas.library.moreActions' }));
    await user.click(await screen.findByRole('button', { name: 'areas.library.remove' }));

    await waitFor(() => expect(useUiStore.getState().location).toEqual({ area: 'library' }));
    // Mentre l'opera veniva tolta si era ancora sulla sua scheda: il ritorno
    // al catalogo arriva dopo, non insieme.
    expect(posizioneDuranteLaRimozione).toEqual({ area: 'library', itemId: 's1' });
  });

  it('riportare in catalogo tiene i comandi spenti finché non è finito', async () => {
    const service = await import('../../services/libraryService');
    // Il ripristino resta appeso finché non lo si lascia finire: è l'unico modo
    // di guardare com'è la riga *mentre* la richiesta è in corso.
    const sblocca: Array<() => void> = [];
    vi.mocked(service.setSourceArchived).mockImplementationOnce(
      () => new Promise<void>((resolve) => sblocca.push(resolve)),
    );
    useSourceLibraryStore.setState({
      catalog: [
        entry({ source: { ...entry().source, status: 'archived', archivedAt: '2026-08-30' } }),
      ],
    });

    render(<LibraryCatalogArea />);
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.filters.showArchived' }));
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.restore' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'areas.library.restore' })).toBeDisabled(),
    );
    sblocca.forEach((resolve) => resolve());
  });

  it('corregge a mano un dato dell opera e lo segna come corretto', async () => {
    const service = await import('../../services/libraryService');
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: 'Anonimo',
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea itemId="s1" />);
    const creatorRow = screen
      .getByText('areas.library.creatorField')
      .closest('div') as HTMLElement;
    await user.click(within(creatorRow).getByRole('button', { name: 'areas.library.fieldEdit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'areas.library.creatorField' }), {
      target: { value: 'Jean Pucelle' },
    });
    await user.click(screen.getByRole('button', { name: 'areas.library.fieldSave' }));

    await waitFor(() =>
      expect(service.setSourceFieldOverride).toHaveBeenCalledWith('s1', 'creator', 'Jean Pucelle'),
    );
  });

  it('nella tab Note, scrivere salva da solo dopo una breve pausa', async () => {
    const service = await import('../../services/libraryService');
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });

    render(<LibraryCatalogArea itemId="s1" />);
    fireEvent.click(screen.getByRole('tab', { name: 'areas.library.notesTab' }));
    // La tab apre in anteprima: si scrive passando prima alla scrittura.
    fireEvent.click(screen.getByRole('button', { name: 'editor.write' }));
    fireEvent.change(screen.getByPlaceholderText('areas.library.notesPlaceholder'), {
      target: { value: 'Legatura settecentesca rifatta.' },
    });

    await waitFor(
      () =>
        expect(service.setSourceFieldOverride).toHaveBeenCalledWith(
          's1',
          'notes',
          'Legatura settecentesca rifatta.',
        ),
      { timeout: 2000 },
    );
  });

  it('la tab Note mostra le note già salvate dell\'opera', async () => {
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
        notes: 'Legatura settecentesca rifatta.',
      },
    });

    render(<LibraryCatalogArea itemId="s1" />);
    fireEvent.click(screen.getByRole('tab', { name: 'areas.library.notesTab' }));

    // Apre in anteprima: il testo si legge subito, senza passare a scrittura.
    expect(screen.getByText('Legatura settecentesca rifatta.')).toBeInTheDocument();
  });

  it('mostra la natura dell\'origine come sola lettura, non più correggibile dalla scheda', async () => {
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });

    render(<LibraryCatalogArea itemId="s1" />);
    const kindRow = screen.getByText('areas.library.kind').closest('div') as HTMLElement;
    expect(within(kindRow).queryByRole('button', { name: 'areas.library.fieldEdit' })).toBeNull();
  });

  it('se la correzione non si salva, il campo resta aperto e lo dice', async () => {
    const service = await import('../../services/libraryService');
    vi.mocked(service.setSourceFieldOverride).mockRejectedValueOnce(new Error('database occupato'));
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: 'Anonimo',
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea itemId="s1" />);
    const creatorRow = screen
      .getByText('areas.library.creatorField')
      .closest('div') as HTMLElement;
    await user.click(within(creatorRow).getByRole('button', { name: 'areas.library.fieldEdit' }));
    await user.click(screen.getByRole('button', { name: 'areas.library.fieldSave' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'areas.library.fieldSaveFailed',
        expect.anything(),
      ),
    );
    // Il campo è ancora lì: chiuderlo direbbe che la correzione è passata.
    expect(
      screen.getByRole('textbox', { name: 'areas.library.creatorField' }),
    ).toBeInTheDocument();
  });

  it('da un dato corretto si torna a quello della biblioteca', async () => {
    const service = await import('../../services/libraryService');
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: 'Jean Pucelle',
        date: null,
        original: { creator: 'Anonimo' },
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });

    render(<LibraryCatalogArea itemId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.fieldRestoreOriginal' }));

    await waitFor(() =>
      expect(service.setSourceFieldOverride).toHaveBeenCalledWith('s1', 'creator', null),
    );
  });

  it('riordina il catalogo dal comando di ordinamento', async () => {
    useSourceLibraryStore.setState({
      catalog: [
        entry({
          source: { ...entry().source, id: 's1', title: 'Vita nuova', createdAt: '2026-08-20' },
        }),
        entry({
          source: { ...entry().source, id: 's2', title: 'Convivio', createdAt: '2026-08-01' },
        }),
      ],
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea />);
    const titoli = () =>
      screen
        .getAllByRole('button', { name: /Vita nuova|Convivio/ })
        .map((node) => node.textContent);

    // Di partenza il catalogo è in ordine di titolo.
    expect(titoli()[0]).toContain('Convivio');

    openFilters();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'areas.library.filters.sortLabel' }),
      'added',
    );

    // Per data di aggiunta viene prima l'ultima arrivata.
    expect(titoli()[0]).toContain('Vita nuova');
  });

  it('mostra solo le opere collegate al workspace scelto', async () => {
    useWorkspaceStore.setState({
      workspaces: [{ id: 'ws-1', name: 'Scherma' } as never],
      activeWorkspace: null,
    });
    useSourceLibraryStore.setState({
      catalog: [
        entry({ source: { ...entry().source, id: 's1', title: 'Vita nuova' } }),
        entry({
          source: { ...entry().source, id: 's2', title: 'Convivio' },
          workspaces: [{ workspaceId: 'ws-1', workspaceName: 'Scherma', isOrigin: false }],
        }),
      ],
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea />);
    openFilters();
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'areas.library.filters.workspaceLabel' }),
      'ws-1',
    );

    expect(screen.getByText('Convivio')).toBeInTheDocument();
    expect(screen.queryByText('Vita nuova')).not.toBeInTheDocument();
  });

  it('se una collezione non si aggiorna, lo dice invece di lasciar cadere l errore', async () => {
    const collectionsService = await import('../../services/libraryCollectionsService');
    // Solo per questo caso: un'implementazione che resta guasterebbe i casi
    // successivi, che si aspettano una creazione riuscita.
    vi.mocked(collectionsService.createCollection).mockRejectedValueOnce(
      new Error('database occupato'),
    );
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea itemId="s1" />);
    await user.click(screen.getByRole('tab', { name: 'areas.library.linksTab' }));
    await user.click(screen.getByRole('button', { name: 'areas.library.addToCollection' }));
    await user.type(
      screen.getByRole('textbox', { name: 'areas.library.newCollectionLabel' }),
      'Codici miniati{Enter}',
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'areas.library.collectionFailed',
        expect.anything(),
      ),
    );
  });

  it('salva la vista corrente con un nome, coi filtri di quel momento', async () => {
    const views = await import('../../services/librarySavedViewsService');
    useSourceLibraryStore.setState({ catalog: [entry()] });
    const user = userEvent.setup();

    render(<LibraryCatalogArea />);
    await user.type(
      screen.getByRole('searchbox', { name: 'areas.library.filters.searchLabel' }),
      'hours',
    );
    await user.click(screen.getByRole('button', { name: 'areas.library.filters.savedViews' }));
    await user.type(
      screen.getByRole('textbox', { name: 'areas.library.filters.newViewLabel' }),
      'Miniati',
    );
    await user.click(screen.getByRole('button', { name: 'areas.library.filters.saveView' }));

    await waitFor(() =>
      expect(views.saveView).toHaveBeenCalledWith(
        'Miniati',
        expect.objectContaining({ query: 'hours' }),
      ),
    );
  });

  it('richiamando una vista salvata i filtri tornano quelli di allora', async () => {
    const views = await import('../../services/librarySavedViewsService');
    vi.mocked(views.listSavedViews).mockResolvedValue([
      {
        id: 'view-1',
        name: 'Solo stampati',
        filters: { ...EMPTY_LIBRARY_FILTERS, kind: 'print' },
        createdAt: '2026-08-30',
      },
    ]);
    useSourceLibraryStore.setState({ catalog: [entry()] });
    const user = userEvent.setup();

    render(<LibraryCatalogArea />);
    await user.click(screen.getByRole('button', { name: 'areas.library.filters.savedViews' }));
    await user.click(await screen.findByRole('button', { name: 'Solo stampati' }));

    // L'opera è un manoscritto: con la vista dei soli stampati sparisce.
    await waitFor(() =>
      expect(screen.getByText('areas.library.filters.noMatches')).toBeInTheDocument(),
    );
  });

  it('aggiunge l opera a una collezione nuova dalla sua scheda', async () => {
    const collectionsService = await import('../../services/libraryCollectionsService');
    useSourceLibraryStore.setState({
      catalog: [entry()],
      detail: {
        source: entry().source,
        versions: [],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea itemId="s1" />);
    await user.click(screen.getByRole('tab', { name: 'areas.library.linksTab' }));
    await user.click(screen.getByRole('button', { name: 'areas.library.addToCollection' }));
    await user.type(
      screen.getByRole('textbox', { name: 'areas.library.newCollectionLabel' }),
      'Codici miniati{Enter}',
    );

    await waitFor(() =>
      expect(collectionsService.createCollection).toHaveBeenCalledWith('Codici miniati'),
    );
    expect(collectionsService.setSourceCollection).toHaveBeenCalledWith('coll-2', 's1', true);
  });

  it('shows the detail panel when itemId is provided and detail is loaded', async () => {
    useSourceLibraryStore.setState({
      detail: {
        source: { id: 's1', title: 'Book of Hours', kind: 'iiif', primaryLanguage: null, externalRef: null, status: 'active', archivedAt: null, createdAt: '2026-01-01' },
        versions: [{ id: 'v1', sourceId: 's1', label: 'primary', versionKind: 'iiif_manifest', sourceUrl: 'https://x.test/m.json', isPrimary: true, createdAt: '2026-01-01', expectedPages: null, providerKey: null }],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });

    const user = userEvent.setup();
    render(<LibraryCatalogArea itemId="s1" />);

    expect(screen.getAllByText('Book of Hours').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('tab', { name: 'areas.library.copiesTab' }));
    expect(screen.getByText('https://x.test/m.json')).toBeInTheDocument();
  });

  it('shows linked workspaces as chips, and the rest in the picker to link one', async () => {
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'ws-stale', name: 'Stale' } as never,
      workspaces: [
        { id: 'ws-1', name: 'Archivio' } as never,
        { id: 'ws-2', name: 'Ricerca' } as never,
      ],
    });
    useSourceLibraryStore.setState({
      detail: {
        source: { id: 's1', title: 'Book of Hours', kind: 'iiif', primaryLanguage: null, externalRef: null, status: 'active', archivedAt: null, createdAt: '2026-01-01' },
        versions: [],
        linkedWorkspaceIds: ['ws-2'],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea itemId="s1" />);
    await user.click(screen.getByRole('tab', { name: 'areas.library.linksTab' }));

    // Il nome del workspace è solo testo: solo la X (con l'aria-label del
    // comando) scioglie il legame, non tutto il riquadro.
    expect(screen.getByText('Ricerca')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'areas.library.unlinkWorkspace' })).toBeInTheDocument();
    expect(screen.queryByText('Archivio')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'areas.library.linkToWorkspace' }));
    expect(screen.getByText('Archivio')).toBeInTheDocument();
  });

  it('toggles the link for the clicked workspace only, using that workspace id, never activeWorkspace', async () => {
    const service = await import('../../services/libraryService');
    useWorkspaceStore.setState({
      activeWorkspace: { id: 'ws-stale', name: 'Stale' } as never,
      workspaces: [{ id: 'ws-1', name: 'Archivio' } as never],
    });
    useSourceLibraryStore.setState({
      detail: {
        source: { id: 's1', title: 'Book of Hours', kind: 'iiif', primaryLanguage: null, externalRef: null, status: 'active', archivedAt: null, createdAt: '2026-01-01' },
        versions: [],
        linkedWorkspaceIds: [],
        creator: null,
        date: null,
        original: {},
        collections: [],
        ...EMPTY_DETAIL_METADATA,
      },
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea itemId="s1" />);
    await user.click(screen.getByRole('tab', { name: 'areas.library.linksTab' }));
    await user.click(screen.getByRole('button', { name: 'areas.library.linkToWorkspace' }));
    await user.click(screen.getByRole('button', { name: 'Archivio' }));

    expect(service.setWorkspaceSourceLink).toHaveBeenCalledWith('ws-1', 's1', true);
  });


  it('la chiave della biblioteca viene da dove i file stanno davvero', async () => {
    // I metadati e il disco possono non concordare: le fonti aggiunte prima che
    // la provenienza venisse salvata hanno i file sotto una chiave e i metadati
    // vuoti. Chiedere lo scaricamento con la chiave dei metadati farebbe
    // riscaricare tutto in una cartella nuova.
    const service = await import('../../services/libraryService');
    vi.mocked(service.versionProviderKey).mockResolvedValue('unknown');
    const { enqueueSourceDownload } = await import('../../services/jobsService');
    vi.mocked(enqueueSourceDownload).mockResolvedValue({ id: 'download:v1' } as never);
    useSourceLibraryStore.setState({ catalog: [entry({ providerKey: 'archive_org' })] });

    render(<LibraryCatalogArea />);
    openRowMenu();
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.download' }));

    await waitFor(() =>
      expect(enqueueSourceDownload).toHaveBeenCalledWith(
        expect.objectContaining({ providerKey: 'unknown' }),
      ),
    );
  });
});
