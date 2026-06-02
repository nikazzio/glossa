import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./dbService', () => dbMocks);

const { createWorkspace, listWorkspaces, getActiveWorkspaceId, setActiveWorkspaceId } =
  await import('./workspaceService');

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

  it('getActiveWorkspaceId returns null when getSetting returns empty string', async () => {
    dbMocks.getSetting.mockResolvedValueOnce('');
    const id = await getActiveWorkspaceId();
    expect(id).toBeNull();
  });

  it('setActiveWorkspaceId calls setSetting with active_workspace_id key', async () => {
    await setActiveWorkspaceId('ws_abc123');
    expect(dbMocks.setSetting).toHaveBeenCalledWith('active_workspace_id', 'ws_abc123');
  });
});
