import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => {
  const columnsByTable = new Map<string, string[]>([
    ['pipeline_configs', ['id', 'project_id', 'stages', 'judge_prompt', 'judge_model', 'judge_provider', 'use_chunking']],
    ['translations', ['id', 'project_id', 'original_text', 'final_translation', 'stage_results', 'judge_issues', 'created_at']],
    ['prompt_templates', []],
  ]);

  const execute = vi.fn(async (query: string) => {
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
    db: { execute, select },
    load: vi.fn(async () => ({ execute, select })),
  };
});

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: {
    load: dbState.load,
  },
}));

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
      expect.stringContaining('ALTER TABLE translations ADD COLUMN position INTEGER DEFAULT NULL'),
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
