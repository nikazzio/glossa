import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const {
  addSourceToLibrary,
  getLibrarySourceDetail,
  registerDeclaredDocument,
  resyncSourceFromManifest,
  setSourceArchived,
  setWorkspaceSourceLink,
} = await import('./libraryService');

const baseInput = {
  manifestUrl: 'https://iiif.example.test/manifest.json',
  title: 'Book of Hours',
  description: null,
  kind: 'iiif' as const,
  creator: null,
  date: null,
  thumbnailUrl: null,
  language: null,
  subjects: [],
  providerKey: null,
  externalId: null,
  mediaType: null,
  materialType: null,
  collection: null,
  volume: null,
  itemCount: null,
  contributors: [],
  publisher: null,
  rights: [],
  physicalDescription: null,
  holdingInstitution: null,
  catalogUrl: null,
  pageUrl: null,
  raw: {},
};

describe('metadati della fonte', () => {
  const recorded: unknown[][] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    recorded.length = 0;
    dbMocks.select.mockResolvedValue([]);
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.runInTransaction.mockImplementation(
      async (callback: (run: (query: string, params?: unknown[]) => Promise<void>) => Promise<void>) => {
        await callback(async (query, params) => {
          recorded.push([query, params]);
        });
      },
    );
  });

  it('salva anche i dati che oggi nessuna schermata mostra', async () => {
    // Rifare la ricerca per recuperare un dato che avevamo gia' in mano e'
    // lavoro sprecato, e la biblioteca potrebbe non ridarlo uguale domani.
    await addSourceToLibrary({
      ...baseInput,
      providerKey: 'gallica',
      externalId: 'btv1b84260335',
      mediaType: 'text',
      collection: 'manuscrits',
      volume: 'II',
      itemCount: 210,
      contributors: ['Cavalcabo, Girolamo'],
      publisher: 'Claude Le Villain (Rouen)',
      rights: ['domaine public'],
      physicalDescription: '23-[1 bl.] p. ; in-12',
      holdingInstitution: 'Bibliothèque nationale de France, V-22944',
      catalogUrl: 'http://catalogue.bnf.fr/ark:/12148/cb33412414z',
      pageUrl: 'https://gallica.bnf.fr/ark:/12148/btv1b84260335',
    });

    const written = JSON.stringify(recorded);
    // La provenienza sulla fonte, il resto nei metadati della digitalizzazione.
    expect(written).toContain('gallica:btv1b84260335');
    expect(written).toContain('providerKey');
    expect(written).toContain('manuscrits');
    expect(written).toContain('210');
    expect(written).toContain('Cavalcabo, Girolamo');
    expect(written).toContain('Claude Le Villain (Rouen)');
    expect(written).toContain('domaine public');
    expect(written).toContain('23-[1 bl.] p. ; in-12');
    expect(written).toContain('V-22944');
    expect(written).toContain('cb33412414z');
    expect(written).toContain('btv1b84260335');
  });
});

describe('libraryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.select.mockResolvedValue([]);
    dbMocks.runInTransaction.mockImplementation(async (callback: (run: typeof dbMocks.execute) => Promise<void>) => {
      await callback(dbMocks.execute);
    });
  });

  describe('addSourceToLibrary', () => {
    it('crea una nuova fonte quando il manifestUrl non esiste ancora', async () => {
      dbMocks.select.mockResolvedValueOnce([]);

      const result = await addSourceToLibrary(baseInput);

      expect(result.wasCreated).toBe(true);
      expect(dbMocks.runInTransaction).toHaveBeenCalledTimes(1);
      const queries = dbMocks.execute.mock.calls.map(([query]) => query as string);
      expect(queries.some((q) => q.includes('INSERT INTO sources'))).toBe(true);
      expect(queries.some((q) => q.includes('INSERT INTO source_versions'))).toBe(true);
      // Nessuna riga negli asset: dove sta il manifesto lo dice la disposizione
      // delle cartelle, e non c'è nessuno che terrebbe vera quella riga.
      expect(queries.some((q) => q.includes('INSERT INTO assets'))).toBe(false);
    });

    it('non duplica una fonte gia\' presente per lo stesso manifestUrl', async () => {
      dbMocks.select.mockResolvedValueOnce([{ source_id: 'source-existing' }]);

      const result = await addSourceToLibrary(baseInput);

      expect(result).toEqual({ sourceId: 'source-existing', wasCreated: false });
      expect(dbMocks.runInTransaction).not.toHaveBeenCalled();
      expect(dbMocks.execute).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO sources'),
        expect.anything(),
      );
    });

    it('collega solo il workspace quando la fonte esiste gia\' ed e\' un nuovo workspace', async () => {
      dbMocks.select.mockResolvedValueOnce([{ source_id: 'source-existing' }]);

      await addSourceToLibrary({ ...baseInput, workspaceId: 'ws-1' });

      expect(dbMocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workspace_items'),
        ['ws-1', 'source-existing'],
      );
      expect(dbMocks.runInTransaction).not.toHaveBeenCalled();
    });

    it('collega il workspace anche per una fonte nuova, dentro la stessa transazione', async () => {
      dbMocks.select.mockResolvedValueOnce([]);

      await addSourceToLibrary({ ...baseInput, workspaceId: 'ws-1' });

      const queries = dbMocks.execute.mock.calls.map(([query]) => query as string);
      expect(queries.some((q) => q.includes('INSERT INTO workspace_items'))).toBe(true);
    });

    it('rifiuta un titolo vuoto senza toccare il database', async () => {
      await expect(addSourceToLibrary({ ...baseInput, title: '  ' })).rejects.toThrow();
      expect(dbMocks.select).not.toHaveBeenCalled();
      expect(dbMocks.execute).not.toHaveBeenCalled();
      expect(dbMocks.runInTransaction).not.toHaveBeenCalled();
    });

    it('rifiuta un manifestUrl non valido senza toccare il database', async () => {
      await expect(addSourceToLibrary({ ...baseInput, manifestUrl: 'not-a-url' })).rejects.toThrow();
      expect(dbMocks.select).not.toHaveBeenCalled();
    });
  });

  describe('getLibrarySourceDetail', () => {
    it('rigetta se la fonte non esiste', async () => {
      dbMocks.select.mockResolvedValueOnce([]);

      await expect(getLibrarySourceDetail('missing')).rejects.toThrow();
    });

    it('restituisce fonte, versioni e link workspace', async () => {
      dbMocks.select
        .mockResolvedValueOnce([{ id: 's1', title: 'Titolo', kind: 'iiif', primary_language: null, external_ref: null, created_at: '2026-01-01' }])
        .mockResolvedValueOnce([{ id: 'v1', source_id: 's1', label: 'primary', version_kind: 'iiif_manifest', source_url: 'https://x.test/m.json', is_primary: 1, created_at: '2026-01-01' }])
        .mockResolvedValueOnce([{ workspace_id: 'ws-1' }]);

      const detail = await getLibrarySourceDetail('s1');

      expect(detail.source.id).toBe('s1');
      expect(detail.versions).toHaveLength(1);
      expect(detail.linkedWorkspaceIds).toEqual(['ws-1']);
    });

    it('rilegge tutti i metadati salvati, non solo autore e data', async () => {
      const metadata = JSON.stringify({
        creator: 'Strozzi, Filippo',
        date: '1610',
        language: 'fre',
        subjects: ['scherma'],
        publisher: 'Claude Le Villain (Rouen)',
        volume: 'II',
        contributors: ['Cavalcabo, Girolamo'],
        rights: ['domaine public'],
        physicalDescription: '23-[1 bl.] p. ; in-12',
        holdingInstitution: 'Bibliothèque nationale de France, V-22944',
        catalogUrl: 'http://catalogue.bnf.fr/ark:/12148/cb33412414z',
        pageUrl: 'https://gallica.bnf.fr/ark:/12148/bpt6k3282120',
        providerKey: 'gallica',
      });
      dbMocks.select
        .mockResolvedValueOnce([{ id: 's1', title: 'Titolo', kind: 'iiif', primary_language: null, external_ref: 'gallica:bpt6k3282120', created_at: '2026-01-01', description: 'Manoscritto in versi.' }])
        .mockResolvedValueOnce([{ id: 'v1', source_id: 's1', label: 'primary', version_kind: 'iiif_manifest', source_url: 'https://x.test/m.json', metadata, is_primary: 1, created_at: '2026-01-01' }])
        .mockResolvedValueOnce([]);

      const detail = await getLibrarySourceDetail('s1');

      expect(detail.language).toBe('fre');
      expect(detail.subjects).toEqual(['scherma']);
      expect(detail.publisher).toBe('Claude Le Villain (Rouen)');
      expect(detail.volume).toBe('II');
      expect(detail.contributors).toEqual(['Cavalcabo, Girolamo']);
      expect(detail.rights).toEqual(['domaine public']);
      expect(detail.physicalDescription).toBe('23-[1 bl.] p. ; in-12');
      expect(detail.holdingInstitution).toBe('Bibliothèque nationale de France, V-22944');
      expect(detail.catalogUrl).toBe('http://catalogue.bnf.fr/ark:/12148/cb33412414z');
      expect(detail.pageUrl).toBe('https://gallica.bnf.fr/ark:/12148/bpt6k3282120');
      expect(detail.providerKey).toBe('gallica');
      expect(detail.description).toBe('Manoscritto in versi.');
    });
  });

  describe('setSourceArchived', () => {
    it('archivia e ripristina con la stessa richiesta, cambiando solo i valori', async () => {
      await setSourceArchived('s1', true);
      const [archiveQuery, archiveParams] = dbMocks.execute.mock.calls[0] as [string, unknown[]];

      dbMocks.execute.mockClear();
      await setSourceArchived('s1', false);
      const [restoreQuery, restoreParams] = dbMocks.execute.mock.calls[0] as [string, unknown[]];

      // La forma della richiesta non dipende dal caso: cambiano solo i valori,
      // e la data segue lo stato senza comporre due testi diversi.
      expect(restoreQuery).toBe(archiveQuery);
      expect(archiveQuery).toContain('UPDATE sources');
      expect(archiveParams).toEqual(['archived', 1, 's1']);
      expect(restoreParams).toEqual(['active', 0, 's1']);
    });
  });

  describe('setWorkspaceSourceLink', () => {
    it('collega con INSERT OR IGNORE quando linked=true', async () => {
      await setWorkspaceSourceLink('ws-1', 's1', true);

      expect(dbMocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO workspace_items'),
        ['ws-1', 's1'],
      );
    });

    it('scollega con DELETE quando linked=false', async () => {
      await setWorkspaceSourceLink('ws-1', 's1', false);

      expect(dbMocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM workspace_items'),
        ['ws-1', 's1'],
      );
    });
  });
});

describe('riallineamento selettivo delle correzioni', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.select.mockResolvedValue([]);
    dbMocks.execute.mockResolvedValue(undefined);
  });

  it("cancella la correzione solo dei campi che il manifesto dichiara adesso, non tutti", async () => {
    // Il manifesto dichiara un autore (`creator`) ma non una data: la
    // correzione manuale sull'autore va sostituita dal dato fresco, quella
    // sulla data — che la biblioteca qui non dà — deve restare, insieme a un
    // campo che dalla biblioteca non arriva mai (`notes`).
    await resyncSourceFromManifest('s1', {
      ...baseInput,
      title: 'Book of Hours',
      creator: 'Anonimo',
      date: null,
    });

    const deleteCall = dbMocks.execute.mock.calls.find((call: unknown[]) =>
      (call[0] as string).includes('DELETE FROM source_field_overrides'),
    );
    expect(deleteCall).toBeDefined();
    const [, params] = deleteCall as [string, unknown[]];
    // sourceId + campi: qui deve esserci 'creator' e 'title', non 'date' né
    // 'notes'.
    expect(params).toContain('creator');
    expect(params).toContain('title');
    expect(params).not.toContain('date');
    expect(params).not.toContain('notes');
  });
});

describe('il PDF dichiarato dalla biblioteca', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.select.mockResolvedValue([]);
    dbMocks.execute.mockResolvedValue(undefined);
  });

  it('nasce come copia a sé, non come misura di quella a immagini', async () => {
    const registered = await registerDeclaredDocument('s1', {
      url: 'https://example.test/opera.pdf',
      label: 'View as PDF',
      providerKey: 'wellcome',
    });

    expect(registered).toBe(true);
    const [query, params] = dbMocks.execute.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('INSERT INTO source_versions');
    expect(params).toContain('pdf');
    expect(params).toContain('https://example.test/opera.pdf');
    // L'etichetta della copia è fissa: la tabella ne impone di distinte dentro
    // la stessa opera, e quella della biblioteca resta nei metadati.
    expect(params).toContain('PDF');
    expect(params.some((value) => String(value).includes('View as PDF'))).toBe(true);
  });

  it('chiesto due volte con lo stesso indirizzo non tocca niente', async () => {
    dbMocks.select.mockResolvedValue([
      { id: 'sver-1', source_url: 'https://example.test/opera.pdf' },
    ]);

    const registered = await registerDeclaredDocument('s1', {
      url: 'https://example.test/opera.pdf',
      label: null,
    });

    expect(registered).toBe(false);
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it('se la biblioteca cambia indirizzo aggiorna la copia invece di affiancarne una seconda', async () => {
    dbMocks.select.mockResolvedValue([
      { id: 'sver-1', source_url: 'https://example.test/vecchio.pdf' },
    ]);

    const registered = await registerDeclaredDocument('s1', {
      url: 'https://example.test/nuovo.pdf',
      label: 'PDF',
    });

    expect(registered).toBe(true);
    const [query, params] = dbMocks.execute.mock.calls[0] as [string, unknown[]];
    expect(query).toContain('UPDATE source_versions');
    expect(params).toContain('https://example.test/nuovo.pdf');
    expect(params).toContain('sver-1');
  });

  it('un indirizzo che non è un indirizzo non entra in Biblioteca', async () => {
    const registered = await registerDeclaredDocument('s1', {
      url: 'non-un-indirizzo',
      label: null,
    });

    expect(registered).toBe(false);
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });
});
