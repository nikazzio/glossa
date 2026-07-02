import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  saveOperationLogEntry: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/dbService', async () => {
  const actual =
    await vi.importActual<typeof import('../services/dbService')>('../services/dbService');
  return { ...actual, ...dbMocks };
});

import { logOperation, useOperationLogStore } from './operationLogStore';

beforeEach(() => {
  useOperationLogStore.setState({ entries: [], currentProjectId: null });
  dbMocks.saveOperationLogEntry.mockClear();
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

  it('caps the log buffer', () => {
    for (let i = 0; i < 2100; i++) {
      logOperation({ level: 'info', scope: 'chunk', message: `entry-${i}` });
    }

    const entries = useOperationLogStore.getState().entries;
    expect(entries).toHaveLength(2000);
    expect(entries[0].message).toBe('entry-100');
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

  it('backfills entries logged before the project had an id once it gets one', async () => {
    logOperation({ level: 'info', scope: 'pipeline', message: 'run started' });
    logOperation({ level: 'success', scope: 'stage', message: 'stage done' });
    expect(dbMocks.saveOperationLogEntry).not.toHaveBeenCalled();

    useOperationLogStore.getState().setProjectId('proj-1');
    await Promise.resolve();

    expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledTimes(2);
    expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ message: 'run started' }),
    );
    expect(dbMocks.saveOperationLogEntry).toHaveBeenCalledWith(
      'proj-1',
      expect.objectContaining({ message: 'stage done' }),
    );
  });

  it('does not re-backfill already-persisted entries on a later setProjectId call', async () => {
    useOperationLogStore.getState().setProjectId('proj-1');
    logOperation({ level: 'info', scope: 'pipeline', message: 'already persisted' });
    await Promise.resolve();
    dbMocks.saveOperationLogEntry.mockClear();

    useOperationLogStore.getState().setProjectId('proj-1');
    await Promise.resolve();

    expect(dbMocks.saveOperationLogEntry).not.toHaveBeenCalled();
  });
});
