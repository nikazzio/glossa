import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const { addSourceToLibrary, getLibrarySourceDetail, setWorkspaceSourceLink } =
  await import('./libraryService');

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
    });

    const written = JSON.stringify(recorded);
    // La provenienza sulla fonte, il resto nei metadati della digitalizzazione.
    expect(written).toContain('gallica:btv1b84260335');
    expect(written).toContain('providerKey');
    expect(written).toContain('manuscrits');
    expect(written).toContain('210');
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
