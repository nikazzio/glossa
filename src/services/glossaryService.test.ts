import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  runInTransaction: vi.fn(),
}));

vi.mock('./dbService', () => dbMocks);

const { listGlossaries, createGlossary } = await import('./glossaryService');

describe('glossaryService — ownership del workspace (#213)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.select.mockResolvedValue([]);
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
});
