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

async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
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
      source_text TEXT DEFAULT ''
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
      judge_issues TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('pipeline_configs', 'target_chunk_count', "INTEGER DEFAULT 0");
  await ensureColumn('pipeline_configs', 'source_text', "TEXT DEFAULT ''");
  await ensureColumn('projects', 'view_mode', 'TEXT DEFAULT NULL');
  await ensureColumn('translations', 'position', 'INTEGER DEFAULT NULL');
  await ensureColumn('translations', 'chunk_status', "TEXT DEFAULT 'ready'");
  await ensureColumn('translations', 'judge_status', "TEXT DEFAULT 'idle'");
  await ensureColumn('translations', 'judge_rating', "TEXT DEFAULT 'fair'");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

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

// Il plugin @tauri-apps/plugin-sql usa un connection pool interno: BEGIN/COMMIT
// eseguiti su connessioni diverse del pool non formano una vera transazione e
// causano lock contention (busy_timeout da 5 s). Si serializzano invece tutte
// le write tramite la coda JS, garantendo esecuzione ordinata senza lock espliciti,
// ma non atomicità o rollback tra più statement.
export async function runInTransaction<T>(
  fn: (executeTx: (query: string, params?: unknown[]) => Promise<void>) => Promise<T>,
): Promise<T> {
  return serializeWrite(async () => {
    const conn = await getDb();
    const run = async (query: string, params: unknown[] = []) => {
      await conn.execute(query, params);
    };
    return fn(run);
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
