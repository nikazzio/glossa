import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:glossa.db');
  }
  return db;
}

// Serializza tutte le write su un'unica coda JS per evitare la contesa di lock
// SQLite quando il plugin Tauri usa un connection pool interno.
let writeQueue: Promise<unknown> = Promise.resolve();

function serializeWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(fn, fn);
  writeQueue = next.then(() => {}, () => {});
  return next;
}

// Whitelist of (table.column) pairs allowed to be added via migration.
// Any call with values outside this set is rejected to prevent SQL injection.
const ALLOWED_MIGRATIONS = new Set([
  'pipeline_configs.target_chunk_count',
  'pipeline_configs.source_text',
  'pipeline_configs.document_format',
  'pipeline_configs.markdown_aware',
  'pipeline_configs.experimental_import',
  'projects.view_mode',
  'translations.position',
  'translations.chunk_status',
  'translations.judge_status',
  'translations.judge_rating',
  'translations.translation_locked',
  'translations.coherence_result',
  'translations.footnotes',
  'prompt_templates.context',
]);

export async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  if (!ALLOWED_MIGRATIONS.has(`${table}.${column}`)) {
    throw new Error(`[dbService] ensureColumn: migration not allowed for "${table}.${column}"`);
  }
  const conn = await getDb();
  const columns = await conn.select<Array<{ name: string }>>(`PRAGMA table_info(${table})`);
  if (columns.some((existing) => existing.name === column)) {
    return;
  }
  await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** Run migrations on app startup */
export async function initDatabase(): Promise<void> {
  const conn = await getDb();

  await conn.execute('PRAGMA journal_mode=WAL');
  await conn.execute('PRAGMA synchronous=NORMAL');
  await conn.execute('PRAGMA busy_timeout=10000');
  // Warm up additional pool connections with the same busy_timeout
  // so write contention doesn't hit connections with the shorter default.
  for (let i = 0; i < 8; i++) {
    await execute('PRAGMA busy_timeout=10000');
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_language TEXT NOT NULL DEFAULT 'English',
      target_language TEXT NOT NULL DEFAULT 'Italian',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS pipeline_configs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      stages TEXT NOT NULL DEFAULT '[]',
      judge_prompt TEXT DEFAULT '',
      judge_model TEXT DEFAULT 'gemini-3-flash-preview',
      judge_provider TEXT DEFAULT 'gemini',
      use_chunking INTEGER DEFAULT 1,
      target_chunk_count INTEGER DEFAULT 0,
      source_text TEXT DEFAULT '',
      document_format TEXT DEFAULT 'plain',
      markdown_aware INTEGER DEFAULT 0,
      experimental_import TEXT DEFAULT NULL
    )
  `);

  await conn.execute(`
    DELETE FROM pipeline_configs
    WHERE rowid NOT IN (
      SELECT MAX(rowid)
      FROM pipeline_configs
      GROUP BY project_id
    )
  `);
  await conn.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_configs_project_id
    ON pipeline_configs(project_id)
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS glossaries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      source_language TEXT DEFAULT '',
      target_language TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS glossary_entries (
      id TEXT PRIMARY KEY,
      glossary_id TEXT REFERENCES glossaries(id) ON DELETE CASCADE,
      term TEXT NOT NULL,
      translation TEXT NOT NULL,
      notes TEXT DEFAULT '',
      context TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_glossary_entries_term
    ON glossary_entries(glossary_id, term)
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS project_glossaries (
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      glossary_id TEXT REFERENCES glossaries(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, glossary_id)
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS translations (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      original_text TEXT NOT NULL,
      final_translation TEXT DEFAULT '',
      position INTEGER DEFAULT NULL,
      chunk_status TEXT DEFAULT 'ready',
      stage_results TEXT DEFAULT '{}',
      judge_status TEXT DEFAULT 'idle',
      judge_rating TEXT DEFAULT 'fair',
      translation_locked INTEGER DEFAULT 0,
      judge_issues TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('pipeline_configs', 'target_chunk_count', "INTEGER DEFAULT 0");
  await ensureColumn('pipeline_configs', 'source_text', "TEXT DEFAULT ''");
  await ensureColumn('pipeline_configs', 'document_format', "TEXT DEFAULT 'plain'");
  await ensureColumn('pipeline_configs', 'markdown_aware', 'INTEGER DEFAULT 0');
  await ensureColumn('pipeline_configs', 'experimental_import', 'TEXT DEFAULT NULL');
  await ensureColumn('projects', 'view_mode', 'TEXT DEFAULT NULL');
  await ensureColumn('translations', 'position', 'INTEGER DEFAULT NULL');
  await ensureColumn('translations', 'chunk_status', "TEXT DEFAULT 'ready'");
  await ensureColumn('translations', 'judge_status', "TEXT DEFAULT 'idle'");
  await ensureColumn('translations', 'judge_rating', "TEXT DEFAULT 'fair'");
  await ensureColumn('translations', 'translation_locked', 'INTEGER DEFAULT 0');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      default_model TEXT DEFAULT '',
      default_provider TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await ensureColumn('translations', 'coherence_result', 'TEXT DEFAULT NULL');
  await ensureColumn('translations', 'footnotes', 'TEXT DEFAULT NULL');
  await ensureColumn('prompt_templates', 'context', "TEXT NOT NULL DEFAULT 'stage'");
  // Migrate unique index from (name) to (name, context) so stage/audit can share names
  await conn.execute('DROP INDEX IF EXISTS idx_prompt_templates_name');
  await conn.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_name_context
    ON prompt_templates(name, context)
  `);

  // Migration: rinomina i glossari legacy "Project glossary proj-xxx" con nome leggibile
  try {
    await conn.execute(`
      UPDATE glossaries SET name = 'Glossario ' || p.name
      FROM projects p
      WHERE glossaries.id = 'glossary-' || p.id
        AND glossaries.name LIKE 'Project glossary%'
    `);
  } catch (error) {
    console.warn('[Glossa] Legacy glossary rename migration failed', error);
  }

  console.log('[Glossa] Database initialized');
}

// ── Generic query helpers ────────────────────────────────────────────

export async function execute(query: string, params: unknown[] = []): Promise<void> {
  return serializeWrite(async () => {
    const conn = await getDb();
    await conn.execute(query, params);
  });
}

export async function select<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const conn = await getDb();
  return conn.select<T[]>(query, params);
}

export async function runInTransaction<T>(
  fn: (run: (query: string, params?: unknown[]) => Promise<void>) => Promise<T>,
): Promise<T> {
  return serializeWrite(async () => {
    const conn = await getDb();
    const run = async (query: string, params: unknown[] = []) => {
      await conn.execute(query, params);
    };
    await conn.execute('BEGIN');
    try {
      const result = await fn(run);
      await conn.execute('COMMIT');
      return result;
    } catch (error) {
      try { await conn.execute('ROLLBACK'); } catch { /* ignore rollback error */ }
      throw error;
    }
  });
}

// ── App Settings ─────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const rows = await select<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows.length > 0 ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await execute(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2',
    [key, value],
  );
}
