import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';

const dbState = vi.hoisted(() => {
  let failRollback = false;
  let schemaVersion: string | null = null;
  let workspaceCount = 0;
  const userObjects = new Set<string>();
  const columnsByTable = new Map<string, string[]>([
    ['pipeline_configs', ['id', 'project_id', 'stages', 'judge_prompt', 'judge_model', 'judge_provider', 'use_chunking']],
    ['translations', ['id', 'project_id', 'original_text', 'final_translation', 'stage_results', 'judge_issues', 'created_at']],
    ['prompt_templates', []],
  ]);

  const execute = vi.fn(async (query: string, params?: unknown[]) => {
    if (query.trim() === 'ROLLBACK' && failRollback) {
      throw new Error('rollback failed');
    }
    const createMatch = query.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
    if (createMatch) {
      userObjects.add(createMatch[1]);
    }
    const dropMatch = query.match(/DROP TABLE IF EXISTS (\w+)/);
    if (dropMatch) {
      userObjects.delete(dropMatch[1]);
    }
    const alterMatch = query.match(/^ALTER TABLE (\w+) ADD COLUMN (\w+) /);
    if (alterMatch) {
      const [, table, column] = alterMatch;
      const current = columnsByTable.get(table) ?? [];
      columnsByTable.set(table, [...current, column]);
    }
    if (query.includes("VALUES ('schema_version', $1)") && params?.[0]) {
      schemaVersion = String(params[0]);
    }
  });

  const select = vi.fn(async (query: string, params?: unknown[]) => {
    if (query.includes('FROM sqlite_master') && query.includes("name = $1")) {
      return [{ count: userObjects.has(String(params?.[0])) ? 1 : 0 }];
    }
    if (query.includes('FROM sqlite_master') && query.includes("type IN ('table', 'view')")) {
      return [{ count: userObjects.size }];
    }
    if (query.includes("FROM app_settings WHERE key = 'schema_version'")) {
      return schemaVersion ? [{ value: schemaVersion }] : [];
    }
    if (query.includes('FROM workspaces')) {
      return [{ count: workspaceCount }];
    }
    if (query.includes("FROM app_settings WHERE key = 'active_workspace_id'")) {
      return [{ count: 0 }];
    }
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
    setExistingObjects: (objects: string[]) => {
      userObjects.clear();
      objects.forEach((object) => userObjects.add(object));
    },
    setSchemaVersion: (value: string | null) => {
      schemaVersion = value;
    },
    setWorkspaceCount: (value: number) => {
      workspaceCount = value;
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
    dbState.setExistingObjects([]);
    dbState.setSchemaVersion(null);
    dbState.setWorkspaceCount(0);
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
    dbState.setExistingObjects([]);
    dbState.setSchemaVersion(null);
    dbState.setWorkspaceCount(0);
    dbState.columnsByTable.set('pipeline_configs', ['id', 'project_id', 'stages', 'judge_prompt', 'judge_model', 'judge_provider', 'use_chunking']);
    dbState.columnsByTable.set('translations', ['id', 'project_id', 'original_text', 'final_translation', 'stage_results', 'judge_issues', 'created_at']);
    dbState.columnsByTable.set('prompt_templates', []);
  });

  it('backs up and resets a beta database with an old schema version', async () => {
    dbState.setExistingObjects(['app_settings', 'projects', 'translations']);
    dbState.setSchemaVersion('1');
    vi.mocked(invoke).mockResolvedValueOnce('/tmp/glossa.legacy.db.bak');
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    expect(invoke).toHaveBeenCalledWith('backup_database_file', {
      reason: 'schema-1-to-2026-06-05-beta-reset',
    });
    expect(dbState.db.execute).toHaveBeenCalledWith('PRAGMA wal_checkpoint(FULL)');
    expect(dbState.db.execute).toHaveBeenCalledWith('DROP TABLE IF EXISTS projects');
    expect(dbState.db.execute).toHaveBeenCalledWith('DROP TABLE IF EXISTS translations');
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS projects'),
    );
  });

  it('does not reset a database with the current beta schema version', async () => {
    dbState.setExistingObjects(['app_settings', 'projects', 'workspaces']);
    dbState.setSchemaVersion('2026-06-05-beta-reset');
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    expect(invoke).not.toHaveBeenCalledWith('backup_database_file', expect.anything());
    expect(dbState.db.execute).not.toHaveBeenCalledWith('DROP TABLE IF EXISTS projects');
  });

  it('adds new pipeline and translation columns for existing databases', async () => {
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE pipeline_configs ADD COLUMN words_per_chunk INTEGER DEFAULT 0'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE pipeline_configs ADD COLUMN source_text TEXT DEFAULT ''"),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE pipeline_configs ADD COLUMN review_provider_options TEXT DEFAULT NULL'),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("ALTER TABLE pipeline_configs ADD COLUMN run_status TEXT DEFAULT 'idle'"),
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

  it('creates phrase memory schema tables and workspace_id column', async () => {
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    for (const table of [
      'workspaces',
      'phrase_memory_presets',
      'phrase_memory',
      'source_phrase_embeddings',
      'historical_techniques',
      'technique_tags',
    ]) {
      expect(dbState.db.execute).toHaveBeenCalledWith(
        expect.stringContaining(`CREATE TABLE IF NOT EXISTS ${table}`),
      );
    }
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining('ALTER TABLE projects ADD COLUMN workspace_id'),
    );
  });

  it('seeds 4 builtin phrase memory presets on fresh database', async () => {
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    const seedCalls = (dbState.db.execute.mock.calls as unknown as [string, unknown[]][]).filter(
      ([q]) => q.includes('INSERT OR IGNORE INTO phrase_memory_presets'),
    );
    expect(seedCalls).toHaveLength(4);
  });

  it('inserts active_workspace_id key into app_settings on fresh database', async () => {
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO app_settings (key, value) VALUES ('active_workspace_id', '')"),
    );
  });

  it('creates a default workspace and backfills old projects', async () => {
    const { initDatabase } = await import('./dbService');

    await initDatabase();

    const workspaceInsertCalls = (dbState.db.execute.mock.calls as unknown as [string, unknown[]][]).filter(
      ([q]) => q.includes('INSERT') && q.includes('workspaces') && !q.includes('phrase_memory'),
    );
    expect(workspaceInsertCalls).toHaveLength(1);
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET workspace_id = 'ws_default'"),
    );
    expect(dbState.db.execute).toHaveBeenCalledWith(
      expect.stringContaining("SET value = 'ws_default'"),
    );
  });
});
