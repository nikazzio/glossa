import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({}),
  select: vi.fn().mockResolvedValue([]),
}));

vi.mock('./dbService', () => ({ getDb: vi.fn(() => Promise.resolve(mockDb)) }));

const { createWorkspace, listWorkspaces, getActiveWorkspaceId, setActiveWorkspaceId } =
  await import('./workspaceService');

describe('workspaceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.execute.mockResolvedValue({});
    mockDb.select.mockResolvedValue([]);
  });

  it('createWorkspace returns workspace with ws_ prefix id', async () => {
    const ws = await createWorkspace({ name: 'Test', embeddingModel: 'text-embedding-3-small' });
    expect(ws.id).toMatch(/^ws_/);
    expect(ws.name).toBe('Test');
    expect(ws.embeddingModel).toBe('text-embedding-3-small');
  });

  it('listWorkspaces returns empty array when db returns nothing', async () => {
    mockDb.select.mockResolvedValueOnce([]);
    const result = await listWorkspaces();
    expect(result).toEqual([]);
  });

  it('getActiveWorkspaceId returns null when value is empty string', async () => {
    mockDb.select.mockResolvedValueOnce([{ value: '' }]);
    const id = await getActiveWorkspaceId();
    expect(id).toBeNull();
  });

  it('setActiveWorkspaceId calls execute with active_workspace_id key', async () => {
    await setActiveWorkspaceId('ws_abc123');
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining('active_workspace_id'),
      ['ws_abc123'],
    );
  });
});
