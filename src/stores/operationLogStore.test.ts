import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  saveOperationLogEntry: vi.fn().mockResolvedValue(undefined),
  loadOperationLogs: vi.fn().mockResolvedValue([]),
  clearOperationLogs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/dbService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/dbService')>('../services/dbService');
  return { ...actual, ...dbMocks };
});

import { logOperation, useOperationLogStore } from './operationLogStore';

beforeEach(() => {
  useOperationLogStore.setState({ entries: [], currentProjectId: null, currentPipelineId: null });
  dbMocks.saveOperationLogEntry.mockClear();
  dbMocks.loadOperationLogs.mockClear().mockResolvedValue([]);
  dbMocks.clearOperationLogs.mockClear();
});

describe('operationLogStore', () => {
  it('appends timestamped frontend operation logs', () => {
    logOperation({ level: 'info', scope: 'pipeline', message: 'run started' });

    const [entry] = useOperationLogStore.getState().entries;
    expect(entry.message).toBe('run started');
    expect(entry.scope).toBe('pipeline');
    expect(entry.id).toContain('op-');
    expect(entry.at).toContain('T');
  });

  it('keeps the full log buffer without a cap (decided with the user 2026-07-14)', () => {
    for (let i = 0; i < 2100; i++) {
      logOperation({ level: 'info', scope: 'chunk', message: `entry-${i}` });
    }

    const entries = useOperationLogStore.getState().entries;
    expect(entries).toHaveLength(2100);
    expect(entries[0].message).toBe('entry-0');
    expect(entries.at(-1)?.message).toBe('entry-2099');
  });

  it('preserves phase, durationMs and detailKind on appended entries', () => {
    logOperation({
      level: 'success',
      scope: 'stage',
      message: 'stage completed',
      phase: 'end',
      durationMs: 1234,
      detailKind: 'json',
      detail: '{"foo":"bar"}',
    });

    const [entry] = useOperationLogStore.getState().entries;
    expect(entry.phase).toBe('end');
    expect(entry.durationMs).toBe(1234);
    expect(entry.detailKind).toBe('json');
    expect(entry.detail).toBe('{"foo":"bar"}');
  });

  describe('persistence scoping (project + pipeline)', () => {
    it('does not persist entries until both project and pipeline ids are known', () => {
      logOperation({ level: 'info', scope: 'pipeline', message: 'no project yet' });
      expect(dbMocks.saveOperationLogEntry).not.toHaveBeenCalled();

      useOperationLogStore.setState({ currentProjectId: 'proj-1' });
      logOperation({ level: 'info', scope: 'pipeline', message: 'project but no pipeline' });
      expect(dbMocks.saveOperationLogEntry).not.toHaveBeenCalled();
    });

    it('persists new entries once both ids are set', () => {
      useOperationLogStore.getState().setContext('proj-1', 'pipe-1');
      logOperation({ level: 'info', scope: 'pipeline', message: 'run started' });

      expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledWith(
        'proj-1',
        'pipe-1',
        expect.objectContaining({ message: 'run started' }),
      );
    });

    it('backfills entries logged before the project/pipeline had ids once they are set', async () => {
      logOperation({ level: 'info', scope: 'pipeline', message: 'run started' });
      logOperation({ level: 'success', scope: 'stage', message: 'stage done' });
      expect(dbMocks.saveOperationLogEntry).not.toHaveBeenCalled();

      useOperationLogStore.getState().setContext('proj-1', 'pipe-1');
      await Promise.resolve();

      expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledTimes(2);
      expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledWith(
        'proj-1',
        'pipe-1',
        expect.objectContaining({ message: 'run started' }),
      );
      expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledWith(
        'proj-1',
        'pipe-1',
        expect.objectContaining({ message: 'stage done' }),
      );
    });

    it('backfills entries sequentially rather than firing them all at once', async () => {
      let resolveFirst: () => void = () => {};
      const firstSave = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      dbMocks.saveOperationLogEntry.mockImplementationOnce(() => firstSave);

      logOperation({ level: 'info', scope: 'pipeline', message: 'first' });
      logOperation({ level: 'info', scope: 'pipeline', message: 'second' });

      useOperationLogStore.getState().setContext('proj-1', 'pipe-1');
      await Promise.resolve();
      await Promise.resolve();

      expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledTimes(1);

      resolveFirst();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledTimes(2);
    });

    it('does not re-backfill already-persisted entries on a later setContext call', async () => {
      useOperationLogStore.getState().setContext('proj-1', 'pipe-1');
      logOperation({ level: 'info', scope: 'pipeline', message: 'already persisted' });
      await Promise.resolve();
      dbMocks.saveOperationLogEntry.mockClear();

      useOperationLogStore.getState().setContext('proj-1', 'pipe-1');
      await Promise.resolve();

      expect(dbMocks.saveOperationLogEntry).not.toHaveBeenCalled();
    });
  });

  describe('loadFromDb', () => {
    it('loads entries scoped to the given project and pipeline', async () => {
      dbMocks.loadOperationLogs.mockResolvedValueOnce([
        { id: 'op-1', at: '2026-01-01T00:00:00.000Z', level: 'info', scope: 'pipeline', message: 'restored' },
      ]);

      await useOperationLogStore.getState().loadFromDb('proj-1', 'pipe-1');

      expect(dbMocks.loadOperationLogs).toHaveBeenCalledWith('proj-1', 'pipe-1');
      const state = useOperationLogStore.getState();
      expect(state.currentProjectId).toBe('proj-1');
      expect(state.currentPipelineId).toBe('pipe-1');
      expect(state.entries).toHaveLength(1);
      expect(state.entries[0].message).toBe('restored');
    });
  });

  describe('clear', () => {
    it('clears only the current project + pipeline scope in the db', () => {
      useOperationLogStore.getState().setContext('proj-1', 'pipe-1');
      useOperationLogStore.getState().clear();

      expect(dbMocks.clearOperationLogs).toHaveBeenCalledWith('proj-1', 'pipe-1');
      expect(useOperationLogStore.getState().entries).toEqual([]);
    });

    it('does not hit the db when no full context is set', () => {
      useOperationLogStore.getState().clear();
      expect(dbMocks.clearOperationLogs).not.toHaveBeenCalled();
    });
  });
});
