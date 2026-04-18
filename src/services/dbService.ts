import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load('sqlite:glossa.db');
  }
  return db;
}

/** Run migrations on app startup */
export async function initDatabase(): Promise<void> {
  const conn = await getDb();

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
      use_chunking INTEGER DEFAULT 1
    )
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
      stage_results TEXT DEFAULT '{}',
      judge_score REAL DEFAULT 0,
      judge_issues TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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
  const conn = await getDb();
  await conn.execute(query, params);
}

export async function select<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const conn = await getDb();
  return conn.select<T[]>(query, params);
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
