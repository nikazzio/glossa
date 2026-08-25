import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

const dbState = vi.hoisted(() => {
  const execute = vi.fn(async () => {});
  const select = vi.fn(async () => []);
  return {
    execute,
    select,
    load: vi.fn(async () => ({ execute, select })),
  };
});

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: dbState.load,
  },
}));

const TEST_DATA_DIR = '/tmp/glossa-test-data';

// getDb() calls the mocked `invoke('get_data_dir')` before any other backend
// call to resolve the absolute sqlite URL (see resolveDbUrl in dbService.ts).
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === 'get_data_dir') return { path: TEST_DATA_DIR, isOverride: false };
    return undefined;
  });
});

describe('initDatabase', () => {
  it('configures the connection pragmas without creating or resetting tables', async () => {
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    expect(dbState.execute).toHaveBeenCalledWith('PRAGMA journal_mode=WAL');
    expect(dbState.execute).toHaveBeenCalledWith('PRAGMA synchronous=NORMAL');
    expect(dbState.execute).toHaveBeenCalledWith('PRAGMA busy_timeout=10000');
    expect(dbState.execute).toHaveBeenCalledWith('PRAGMA foreign_keys=ON');
    expect(dbState.execute).not.toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE'));
    expect(dbState.execute).not.toHaveBeenCalledWith(expect.stringContaining('DROP TABLE'));
  });
});

describe('runInTransaction', () => {
  it('executes callback statements through the native transaction command', async () => {
    const { runInTransaction } = await import('./dbService');

    await runInTransaction(async (run) => {
      await run('INSERT INTO foo VALUES ($1)', ['bar']);
    });

    expect(invoke).toHaveBeenCalledWith('execute_transaction', {
      db: 'sqlite:/tmp/glossa-test-data/glossa.db',
      statements: [{ query: 'INSERT INTO foo VALUES ($1)', params: ['bar'] }],
    });
    expect(dbState.execute).not.toHaveBeenCalledWith('BEGIN');
    expect(dbState.execute).not.toHaveBeenCalledWith('COMMIT');
  });

  it('does not execute staged statements when the callback throws', async () => {
    const { runInTransaction } = await import('./dbService');

    await expect(
      runInTransaction(async (run) => {
        await run('INSERT INTO foo VALUES ($1)', ['bar']);
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');

    expect(invoke).not.toHaveBeenCalledWith(
      'execute_transaction',
      expect.anything(),
    );
  });

  it('returns the value produced by the callback', async () => {
    const { runInTransaction } = await import('./dbService');

    const result = await runInTransaction(async (_run) => {
      return 42;
    });

    expect(result).toBe(42);
  });
});

describe('operation log pipeline scoping', () => {
  it('scopes saveOperationLogEntry writes to project and pipeline', async () => {
    const { saveOperationLogEntry } = await import('./dbService');

    await saveOperationLogEntry('proj-1', 'pipe-1', {
      id: 'op-1',
      at: '2026-01-01T00:00:00.000Z',
      level: 'info',
      scope: 'pipeline',
      message: 'hello',
    });

    expect(invoke).toHaveBeenCalledWith('execute_transaction', {
      db: 'sqlite:/tmp/glossa-test-data/glossa.db',
      statements: [{
        query: expect.stringContaining('INSERT OR IGNORE INTO operation_logs'),
        params: [
          'op-1', 'proj-1', 'pipe-1', '2026-01-01T00:00:00.000Z', 'info', 'pipeline', 'hello',
          null, null, null, null, null, null, null,
          null, null, null, null, null, null, null, null, null, null,
        ],
      }],
    });
    // Storico operazioni senza limite (deciso con l'utente 2026-07-14): nessuna
    // riga più vecchia va cancellata a ogni scrittura.
    expect(invoke).not.toHaveBeenCalledWith('execute_transaction', expect.objectContaining({
      statements: [expect.objectContaining({ query: expect.stringContaining('DELETE FROM operation_logs') })],
    }));
  });

  it('scopes loadOperationLogs reads to project and pipeline', async () => {
    const { loadOperationLogs } = await import('./dbService');

    await loadOperationLogs('proj-1', 'pipe-1');

    expect(dbState.select).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM operation_logs WHERE project_id = $1 AND pipeline_id = $2'),
      ['proj-1', 'pipe-1'],
    );
  });

  it('scopes clearOperationLogs deletes to project and pipeline', async () => {
    const { clearOperationLogs } = await import('./dbService');

    await clearOperationLogs('proj-1', 'pipe-1');

    expect(invoke).toHaveBeenCalledWith('execute_transaction', {
      db: 'sqlite:/tmp/glossa-test-data/glossa.db',
      statements: [{
        query: 'DELETE FROM operation_logs WHERE project_id = $1 AND pipeline_id = $2',
        params: ['proj-1', 'pipe-1'],
      }],
    });
  });
});
