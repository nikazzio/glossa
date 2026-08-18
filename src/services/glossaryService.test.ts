import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const { listGlossaries, createGlossary, forkGlossary } = await import('./glossaryService');

describe('glossaryService — ambito del workspace (#213)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.select.mockResolvedValue([]);
    dbMocks.runInTransaction.mockImplementation(async (callback: (run: typeof dbMocks.execute) => Promise<void>) => {
      await callback(dbMocks.execute);
    });
  });

  it('con un workspace elenca i dizionari **collegati** a quello', async () => {
    // Il legame non sta più sulla riga del dizionario: lo stesso dizionario può
    // essere usato in più workspace senza copiarlo.
    await listGlossaries('ws-1');

    const [query, params] = dbMocks.select.mock.calls[0];
    expect(query).toContain('JOIN workspace_items');
    expect(query).toContain("wi.item_type = 'glossary'");
    expect(params).toEqual(['ws-1']);
  });

  it('senza workspace resta il catalogo generale, con la provenienza di ognuno', async () => {
    await listGlossaries();

    const [query, params] = dbMocks.select.mock.calls[0];
    expect(query).not.toContain('JOIN workspace_items');
    expect(query).toContain('is_origin = 1');
    expect(params).toBeUndefined();
  });

  it('creare un dizionario lo collega al workspace, e segna che è nato lì', async () => {
    await createGlossary('Termini', '', '', '', 'ws-2');

    const queries = dbMocks.execute.mock.calls.map(([query]) => String(query));
    expect(queries[0]).toContain('INSERT INTO glossaries');
    expect(queries[1]).toContain('INSERT INTO workspace_items');
    expect(dbMocks.execute.mock.calls[1][1]).toEqual(['ws-2', expect.any(String)]);
  });

  it('forkGlossary assegna la copia al workspace scelto, non al proprietario sorgente', async () => {
    dbMocks.select.mockResolvedValueOnce([{
      id: 'gls-source', name: 'Termini', description: '', source_language: 'IT', target_language: 'EN', created_at: '2026-01-01', workspace_id: 'ws-source',
    }]).mockResolvedValueOnce([]);
    await forkGlossary('gls-source', 'Termini (copia)', 'ws-destination');

    const queries = dbMocks.execute.mock.calls.map(([query]) => String(query));
    expect(queries[0]).toContain('INSERT INTO glossaries');
    // La copia nasce nel workspace scelto: è lì la sua provenienza.
    expect(queries[1]).toContain('INSERT INTO workspace_items');
    expect(dbMocks.execute.mock.calls[1][1]).toEqual(['ws-destination', expect.any(String)]);
  });

  it('forkGlossary rifiuta una sorgente eliminata senza creare una copia fantasma', async () => {
    dbMocks.select.mockResolvedValueOnce([]);

    await expect(forkGlossary('gls-missing', 'Copia', 'ws-destination')).rejects.toThrow('glossary_not_found');
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });
});
