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
  providerKey: 'gallica',
  ...overrides,
});

describe('LibraryCatalogArea', () => {
  beforeEach(async () => {
    vi.mocked(deleteVersionFiles).mockResolvedValue({ deletedFiles: 3, freedBytes: 8_200_000 });
    useSourceLibraryStore.setState({ catalog: [], detail: null, addingUrls: new Set(), addedManifestUrls: new Set(), error: null });
    useWorkspaceStore.setState({ activeWorkspace: null, workspaces: [] });
    // La coda è globale: un lavoro lasciato da un altro test farebbe comparire
    // la percentuale al posto del pulsante.
    useJobsStore.setState({ jobs: [] });
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
          sizes: [{ sizeTag: '2000', pages: 308, bytes: 1_000, missing: 20 }],
        }),
      ],
    });

    render(<LibraryCatalogArea />);

    expect(screen.getByText(/areas\.library\.availabilityComplete/)).toBeInTheDocument();
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
            { sizeTag: '2000', pages: 308, bytes: 1_000, missing: 0 },
            { sizeTag: 'max', pages: 3, bytes: 900, missing: 20 },
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
            { sizeTag: '2000', pages: 328, bytes: 1_000, missing: 0 },
            { sizeTag: 'max', pages: 3, bytes: 900, missing: 0 },
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
            { sizeTag: '2000', pages: 328, bytes: 1_000, missing: 0 },
            { sizeTag: 'max', pages: 328, bytes: 3_000, missing: 0 },
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

  it('offre lo scaricamento e la rimozione per ogni fonte', () => {
    useSourceLibraryStore.setState({ catalog: [entry()] });

    render(<LibraryCatalogArea />);

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

    expect(screen.getByRole('button', { name: 'areas.library.download' })).toBeDisabled();
    expect(screen.getByLabelText('areas.library.availabilityComplete')).toBeInTheDocument();
  });

  it('verifica e libera spazio ci sono sempre, spenti quando non c\u2019è niente in locale', () => {
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 0 })] });

    render(<LibraryCatalogArea />);

    expect(screen.getByRole('button', { name: 'areas.library.verify' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'areas.library.freeSpace' })).toBeDisabled();
  });

  it('con pagine sul computer verifica e libera spazio si accendono', () => {
    useSourceLibraryStore.setState({ catalog: [entry({ localPages: 34, localBytes: 48_234_496 })] });

    render(<LibraryCatalogArea />);

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

    expect(screen.getByText('Scherma')).toBeInTheDocument();
  });

  it('scollega un opera cliccando il workspace su cui sta', async () => {
    const user = userEvent.setup();
    const service = await import('../../services/libraryService');
    useWorkspaceStore.setState({ workspaces: [], activeWorkspace: null });
    useSourceLibraryStore.setState({
      catalog: [
        entry({ workspaces: [{ workspaceId: 'ws1', workspaceName: 'Scherma', isOrigin: false }] }),
      ],
    });

    render(<LibraryCatalogArea />);
    await user.click(screen.getByRole('button', { name: 'Scherma' }));

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

  it('shows the detail panel when itemId is provided and detail is loaded', () => {
    useSourceLibraryStore.setState({
      detail: {
        source: { id: 's1', title: 'Book of Hours', kind: 'iiif', primaryLanguage: null, externalRef: null, createdAt: '2026-01-01' },
        versions: [{ id: 'v1', sourceId: 's1', label: 'primary', versionKind: 'iiif_manifest', sourceUrl: 'https://x.test/m.json', isPrimary: true, createdAt: '2026-01-01' }],
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
        linkedWorkspaceIds: [],
      },
    });
    const user = userEvent.setup();

    render(<LibraryCatalogArea itemId="s1" />);
    const archivioRow = screen.getByText('Archivio').closest('li') as HTMLElement;
    await user.click(within(archivioRow).getByRole('button'));

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
    fireEvent.click(screen.getByRole('button', { name: 'areas.library.download' }));

    await waitFor(() =>
      expect(enqueueSourceDownload).toHaveBeenCalledWith(
        expect.objectContaining({ providerKey: 'unknown' }),
      ),
    );
  });
});
