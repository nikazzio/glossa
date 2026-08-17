import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceIconKey } from '../workspaceIdentity';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  runInTransaction: vi.fn(),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./dbService', () => dbMocks);

const { recordFact } = vi.hoisted(() => ({ recordFact: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./provenanceService', () => ({ recordFact }));

const { createWorkspace, listWorkspaces, updateWorkspace, getActiveWorkspaceId, setActiveWorkspaceId } =
  await import('./workspaceService');
const { deleteWorkspace, moveDocumentToWorkspace } = await import('./workspaceService');

describe('workspaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.select.mockResolvedValue([]);
    dbMocks.runInTransaction.mockImplementation(async (callback: (run: typeof dbMocks.execute) => Promise<void>) => {
      await callback(dbMocks.execute);
    });
    dbMocks.getSetting.mockResolvedValue(null);
    dbMocks.setSetting.mockResolvedValue(undefined);
  });

  it('createWorkspace returns workspace with ws_ prefix id', async () => {
    const ws = await createWorkspace({ name: 'Test', embeddingModel: 'text-embedding-3-small' });
    expect(ws.id).toMatch(/^ws_/);
    expect(ws.name).toBe('Test');
    expect(ws.embeddingModel).toBe('text-embedding-3-small');
    expect(ws.iconKey).toBe('book');
  });

  it('persists the selected preset icon key', async () => {
    await createWorkspace({ name: 'Archivio', embeddingModel: 'text-embedding-3-small', iconKey: 'archive' });

    expect(dbMocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('icon_key'),
      expect.arrayContaining(['archive']),
    );
  });

  it('maps a persisted preset icon key on load', async () => {
    dbMocks.select.mockResolvedValueOnce([{
      id: 'ws_archive', name: 'Archivio', icon_key: 'archive', description: null,
      embedding_model: 'text-embedding-3-small', memory_extractor_provider: 'openai',
      memory_extractor_model: 'gpt-5.4-nano', memory_extractor_prompt: '', created_at: '2026-07-28T00:00:00.000Z',
    }]);

    await expect(listWorkspaces()).resolves.toMatchObject([{ id: 'ws_archive', iconKey: 'archive' }]);
  });

  it('listWorkspaces returns empty array when db returns nothing', async () => {
    dbMocks.select.mockResolvedValueOnce([]);
    const result = await listWorkspaces();
    expect(result).toEqual([]);
  });

  it('updateWorkspace updates only provided fields', async () => {
    await updateWorkspace('ws_abc123', {
      name: 'Updated',
      description: '',
      embeddingModel: 'text-embedding-3-large',
    });

    expect(dbMocks.execute).toHaveBeenCalledWith(
      'UPDATE workspaces SET name = $1, description = $2, embedding_model = $3 WHERE id = $4',
      ['Updated', null, 'text-embedding-3-large', 'ws_abc123'],
    );
  });

  it('persists and validates an updated preset icon key', async () => {
    await updateWorkspace('ws_abc123', { iconKey: 'anchor' });
    expect(dbMocks.execute).toHaveBeenLastCalledWith(
      'UPDATE workspaces SET icon_key = $1 WHERE id = $2',
      ['anchor', 'ws_abc123'],
    );

    await updateWorkspace('ws_abc123', { iconKey: 'invalid' as WorkspaceIconKey });
    expect(dbMocks.execute).toHaveBeenLastCalledWith(
      'UPDATE workspaces SET icon_key = $1 WHERE id = $2',
      ['book', 'ws_abc123'],
    );
  });

  it('getActiveWorkspaceId returns null when getSetting returns empty string', async () => {
    dbMocks.getSetting.mockResolvedValueOnce('');
    const id = await getActiveWorkspaceId();
    expect(id).toBeNull();
  });

  it('setActiveWorkspaceId calls setSetting with active_workspace_id key', async () => {
    await setActiveWorkspaceId('ws_abc123');
    expect(dbMocks.setSetting).toHaveBeenCalledWith('active_workspace_id', 'ws_abc123');
  });

  it('spostando il contenuto, i figli passano al workspace scelto e poi il workspace se ne va', async () => {
    // Prima il comando si rifiutava: «ci sono dei progetti», e l'unica via
    // d'uscita era svuotare tutto a mano.
    await deleteWorkspace('ws_abc123', { kind: 'moveTo', workspaceId: 'ws_altro' });

    expect(dbMocks.execute.mock.calls.map(([query]) => query)).toEqual([
      'UPDATE projects SET workspace_id = $1 WHERE workspace_id = $2',
      'UPDATE glossaries SET workspace_id = $1 WHERE workspace_id = $2',
      'UPDATE phrase_memory SET workspace_id = $1 WHERE workspace_id = $2',
      'UPDATE transcription_documents SET workspace_id = $1 WHERE workspace_id = $2',
      'DELETE FROM workspaces WHERE id = $1',
    ]);
  });

  it('eliminando tutto, il contenuto se ne va prima del workspace', async () => {
    await deleteWorkspace('ws_abc123', { kind: 'deleteEverything' });

    expect(dbMocks.execute.mock.calls.map(([query]) => query)).toEqual([
      'DELETE FROM phrase_memory WHERE workspace_id = $1',
      'DELETE FROM transcription_documents WHERE workspace_id = $1',
      'DELETE FROM projects WHERE workspace_id = $1',
      'DELETE FROM glossaries WHERE workspace_id = $1',
      'DELETE FROM workspaces WHERE id = $1',
    ]);
  });

  it('non si sposta il contenuto dentro il workspace che si sta eliminando', async () => {
    await expect(
      deleteWorkspace('ws_abc123', { kind: 'moveTo', workspaceId: 'ws_abc123' }),
    ).rejects.toThrow('workspace_move_to_itself');
    expect(dbMocks.execute).not.toHaveBeenCalled();
  });

  it('spostare un documento lascia un fatto, e i fatti di prima dove erano', async () => {
    dbMocks.select.mockResolvedValueOnce([{ workspace_id: 'ws_vecchio' }]);

    await moveDocumentToWorkspace('project', 'p1', 'ws_nuovo');

    expect(dbMocks.execute).toHaveBeenCalledWith(
      'UPDATE projects SET workspace_id = $1 WHERE id = $2',
      ['ws_nuovo', 'p1'],
    );
    expect(recordFact).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'workspace.moved',
        entityType: 'project',
        entityId: 'p1',
        keyRef: 'ws_nuovo',
        workspaceId: 'ws_nuovo',
      }),
      // Dentro la stessa transazione dello spostamento: o valgono entrambi, o
      // resterebbe un documento spostato senza la sua storia.
      expect.any(Function),
    );
  });

  it('spostare un documento dove è già non fa niente', async () => {
    dbMocks.select.mockResolvedValueOnce([{ workspace_id: 'ws_uno' }]);

    await moveDocumentToWorkspace('project', 'p1', 'ws_uno');

    expect(dbMocks.execute).not.toHaveBeenCalled();
    expect(recordFact).not.toHaveBeenCalled();
  });
});
