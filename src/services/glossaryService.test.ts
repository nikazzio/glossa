import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const { listGlossaries, createGlossary, forkGlossary } = await import('./glossaryService');

describe('glossaryService — ownership del workspace (#213)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.select.mockResolvedValue([]);
    dbMocks.runInTransaction.mockImplementation(async (callback: (run: typeof dbMocks.execute) => Promise<void>) => {
      await callback(dbMocks.execute);
    });
  });

  it('listGlossaries(workspaceId) filtra solo quel workspace, senza piu\' includere quelli senza padrone', async () => {
    await listGlossaries('ws-1');
    expect(dbMocks.select).toHaveBeenCalledWith(
      expect.stringContaining('WHERE workspace_id = $1'),
      ['ws-1'],
    );
    const [query] = dbMocks.select.mock.calls[0];
    expect(query).not.toContain('OR workspace_id IS NULL');
  });

  it('listGlossaries() senza argomenti resta uno sfoglio globale, non filtrato', async () => {
    await listGlossaries();
    const [query, params] = dbMocks.select.mock.calls[0];
    expect(query).not.toContain('WHERE');
    expect(params).toBeUndefined();
  });

  it('createGlossary scrive sempre il workspaceId passato, nessun default a null', async () => {
    await createGlossary('Termini', '', '', '', 'ws-2');
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO glossaries'),
      expect.arrayContaining(['ws-2']),
    );
    const [, params] = dbMocks.execute.mock.calls[0];
    expect(params).not.toContain(null);
  });

  it('forkGlossary assegna la copia al workspace scelto, non al proprietario sorgente', async () => {
    dbMocks.select.mockResolvedValueOnce([{
      id: 'gls-source', name: 'Termini', description: '', source_language: 'IT', target_language: 'EN', created_at: '2026-01-01', workspace_id: 'ws-source',
    }]).mockResolvedValueOnce([]);
    await forkGlossary('gls-source', 'Termini (copia)', 'ws-destination');
    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('VALUES ($1, $2, $3, $4, $5, $6)'),
      expect.arrayContaining(['Termini (copia)', 'ws-destination']),
    );
  });

  it('forkGlossary rifiuta una sorgente eliminata senza creare una copia fantasma', async () => {
    dbMocks.select.mockResolvedValueOnce([]);

    await expect(forkGlossary('gls-missing', 'Copia', 'ws-destination')).rejects.toThrow('glossary_not_found');
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });
});
