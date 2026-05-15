import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

const dbState = vi.hoisted(() => {
  let failRollback = false;
  const columnsByTable = new Map<string, string[]>([
    ['pipeline_configs', ['id', 'project_id', 'stages', 'judge_prompt', 'judge_model', 'judge_provider', 'use_chunking']],
    ['translations', ['id', 'project_id', 'original_text', 'final_translation', 'stage_results', 'judge_issues', 'created_at']],
    ['prompt_templates', []],
  ]);

  const execute = vi.fn(async (query: string) => {
    if (query.trim() === 'ROLLBACK' && failRollback) {
      throw new Error('rollback failed');
    }
    const alterMatch = query.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+) /);
    if (alterMatch) {
      const [, table, column] = alterMatch;
      const current = columnsByTable.get(table) ?? [];
      columnsByTable.set(table, [...current, column]);
    }
  });

  const select = vi.fn(async (query: string) => {
    const pragmaMatch = query.match(/^PRAGMA table_info\((\w+)\)$/);
    if (!pragmaMatch) return [];
    const table = pragmaMatch[1];
    return (columnsByTable.get(table) ?? []).map((name) => ({ name }));
  });

  return {
    columnsByTable,
    setFailRollback: (value: boolean) => {
      failRollback = value;
    },
    db: { execute, select },
    load: vi.fn(async () => ({ execute, select })),
  };
});

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: dbState.load,
  },
}));

describe('runInTransaction', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbState.setFailRollback(false);
  });

  it('executes callback statements through the native transaction command', async () => {
    const { runInTransaction } = await import('./dbService');

    await runInTransaction(async (run) => {
      await run('INSERT INTO foo VALUES ($1)', ['bar']);
    });

    expect(invoke).toHaveBeenCalledWith('execute_transaction', {
      db: 'sqlite:glossa.db',
      statements: [{ query: 'INSERT INTO foo VALUES ($1)', params: ['bar'] }],
    });
    expect(dbState.db.execute).not.toHaveBeenCalledWith('BEGIN');
    expect(dbState.db.execute).not.toHaveBeenCalledWith('COMMIT');
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

describe('ensureColumn whitelist', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects a table/column pair not in the whitelist', async () => {
    const { ensureColumn } = await import('./dbService');
    await expect(ensureColumn('users', 'password', 'TEXT')).rejects.toThrow('not allowed');
  });

  it('rejects a whitelisted table with an unlisted column', async () => {
    const { ensureColumn } = await import('./dbService');
    await expect(ensureColumn('translations', 'evil_col', 'TEXT')).rejects.toThrow('not allowed');
  });
});

describe('initDatabase migrations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbState.columnsByTable.set('pipeline_configs', ['id', 'project_id', 'stages', 'judge_prompt', 'judge_model', 'judge_provider', 'use_chunking']);
    dbState.columnsByTable.set('translations', ['id', 'project_id', 'original_text', 'final_translation', 'stage_results', 'judge_issues', 'created_at']);
    dbState.columnsByTable.set('prompt_templates', []);
  });

  it('adds new pipeline and translation columns for existing databases', async () => {
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE pipeline_configs ADD COLUMN target_chunk_count INTEGER DEFAULT 0'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE pipeline_configs ADD COLUMN source_text TEXT DEFAULT ''"),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE pipeline_configs ADD COLUMN review_provider_options TEXT DEFAULT NULL'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM pipeline_configs'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_configs_project_id'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE translations ADD COLUMN chunk_status TEXT DEFAULT 'ready'"),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE translations ADD COLUMN judge_status TEXT DEFAULT 'idle'"),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE translations ADD COLUMN judge_rating TEXT DEFAULT 'fair'"),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE translations ADD COLUMN translation_locked INTEGER DEFAULT 0'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE translations ADD COLUMN position INTEGER DEFAULT NULL'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE translations ADD COLUMN blob_reference_chunk_ids TEXT DEFAULT NULL'),
    );
  });

  it('creates the prompt_templates table and unique index on name', async () => {
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS prompt_templates'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_name_context'),
    );
  });
});
