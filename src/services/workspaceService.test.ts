import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./dbService', () => dbMocks);

const { createWorkspace, listWorkspaces, updateWorkspace, getActiveWorkspaceId, setActiveWorkspaceId } =
  await import('./workspaceService');
const { deleteWorkspace } = await import('./workspaceService');

describe('workspaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.execute.mockResolvedValue(undefined);
    dbMocks.select.mockResolvedValue([]);
    dbMocks.getSetting.mockResolvedValue(null);
    dbMocks.setSetting.mockResolvedValue(undefined);
  });

  it('createWorkspace returns workspace with ws_ prefix id', async () => {
    const ws = await createWorkspace({ name: 'Test', embeddingModel: 'text-embedding-3-small' });
    expect(ws.id).toMatch(/^ws_/);
    expect(ws.name).toBe('Test');
    expect(ws.embeddingModel).toBe('text-embedding-3-small');
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

  it('getActiveWorkspaceId returns null when getSetting returns empty string', async () => {
    dbMocks.getSetting.mockResolvedValueOnce('');
    const id = await getActiveWorkspaceId();
    expect(id).toBeNull();
  });

  it('setActiveWorkspaceId calls setSetting with active_workspace_id key', async () => {
    await setActiveWorkspaceId('ws_abc123');
    expect(dbMocks.setSetting).toHaveBeenCalledWith('active_workspace_id', 'ws_abc123');
  });

  it('deleteWorkspace removes workspace-scoped memory before deleting the workspace', async () => {
    await deleteWorkspace('ws_abc123');

    expect(dbMocks.execute.mock.calls.map(([query]) => query)).toEqual([
      'DELETE FROM phrase_memory WHERE workspace_id = $1',
      'DELETE FROM workspaces WHERE id = $1',
    ]);
  });
});
