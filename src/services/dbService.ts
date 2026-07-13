import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import {
  DEFAULT_MEMORY_EXTRACTOR_MODEL,
  DEFAULT_MEMORY_EXTRACTOR_PROMPT,
  DEFAULT_MEMORY_EXTRACTOR_PROVIDER,
} from '../constants';

let db: Database | null = null;
const DB_URL = 'sqlite:glossa.db';
const CURRENT_SCHEMA_VERSION = 'db-schema-v3';

// These tables were introduced before their corresponding product features
// existed. Keep the list explicit so an older beta DB is cleaned up on boot,
// while new databases never create them.
const DEPRECATED_TABLES = [
  'technique_tags',
  'historical_techniques',
  'phrase_memory_presets',
  'macro_blocks',
];

const RESETTABLE_OBJECTS = [
  ...DEPRECATED_TABLES,
  'source_phrase_embeddings',
  'phrase_memory',
  'operation_logs',
  'annotations',
  'translations',
  'custom_providers',
  'project_glossaries',
  'glossary_entries',
  'glossaries',
  'pipelines',
  'prompt_templates',
  'projects',
  'workspaces',
  'app_settings',
];

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load(DB_URL);
  }
  return db;
}

// Whitelist of (table.column) pairs allowed to be added via migration.
// Definitions are kept with their table/column names so callers cannot alter
// arbitrary schema even though SQLite does not bind identifiers.
const ALLOWED_MIGRATIONS = new Map<string, string>([
  ['projects.workspace_id', 'TEXT REFERENCES workspaces(id)'],
  ['phrase_memory.embedding_model', 'TEXT'],
]);

const VALID_COLUMN_DEFINITION = /^(INTEGER|TEXT|REAL|BLOB|NUMERIC)(\s+NOT\s+NULL)?(\s+DEFAULT\s+('[^']*'|NULL|-?\d+(\.\d+)?))?(\s+REFERENCES\s+[a-z_][a-z0-9_]*\([a-z_][a-z0-9_]*\))?$/i;

export function validateColumnDefinition(definition: string): void {
  if (!VALID_COLUMN_DEFINITION.test(definition)) {
    throw new Error(`[dbService] Invalid column definition: "${definition}"`);
  }
}

export async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  const migrationKey = `${table}.${column}`;
  const allowedDefinition = ALLOWED_MIGRATIONS.get(migrationKey);
  if (allowedDefinition !== definition) {
    throw new Error(`[dbService] ensureColumn: migration not allowed for "${table}.${column}"`);
  }
  validateColumnDefinition(definition);
  const conn = await getDb();
  const columns = await conn.select<Array<{ name: string }>>(`PRAGMA table_info(${table})`);
  if (columns.some((existing) => existing.name === column)) {
    return;
  }
  await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function tableExists(conn: Database, table: string): Promise<boolean> {
  const rows = await conn.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = $1`,
    [table],
  );
  return (rows[0]?.count ?? 0) > 0;
}

async function getStoredSchemaVersion(conn: Database): Promise<string | null> {
  if (!(await tableExists(conn, 'app_settings'))) {
    return null;
  }
  try {
    const rows = await conn.select<Array<{ value: string }>>(
      `SELECT value FROM app_settings WHERE key = 'schema_version'`,
    );
    return rows[0]?.value ?? null;
  } catch (error) {
    console.warn('[Glossa] Could not read schema_version', error);
    return null;
  }
}

async function hasExistingUserDatabase(conn: Database): Promise<boolean> {
  const rows = await conn.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count
     FROM sqlite_master
     WHERE type IN ('table', 'view')
       AND name NOT LIKE 'sqlite_%'`,
  );
  return (rows[0]?.count ?? 0) > 0;
}

async function resetDatabaseForCurrentSchema(conn: Database, reason: string): Promise<void> {
  await conn.execute('PRAGMA wal_checkpoint(FULL)');
  const backupPath = await invoke<string | null>('backup_database_file', { reason });
  if (backupPath) {
    console.warn(`[Glossa] Database schema reset: previous DB backed up to ${backupPath}`);
  } else {
    console.warn('[Glossa] Database schema reset: no existing DB file to back up');
  }

  await conn.execute('PRAGMA foreign_keys=OFF');
  for (const objectName of RESETTABLE_OBJECTS) {
    await conn.execute(`DROP TABLE IF EXISTS ${objectName}`);
  }
  await conn.execute('PRAGMA foreign_keys=ON');
}

async function dropDeprecatedTables(conn: Database): Promise<void> {
  for (const table of DEPRECATED_TABLES) {
    await conn.execute(`DROP TABLE IF EXISTS ${table}`);
  }
}

async function resetOutdatedBetaDatabase(conn: Database): Promise<void> {
  const existingDatabase = await hasExistingUserDatabase(conn);
  if (!existingDatabase) {
    return;
  }

  const storedVersion = await getStoredSchemaVersion(conn);
  if (storedVersion === CURRENT_SCHEMA_VERSION) {
    return;
  }

  await resetDatabaseForCurrentSchema(
    conn,
    storedVersion ? `schema-${storedVersion}-to-${CURRENT_SCHEMA_VERSION}` : `schema-missing-to-${CURRENT_SCHEMA_VERSION}`,
  );
}

/** Run migrations on app startup */
export async function initDatabase(): Promise<void> {
  const conn = await getDb();

  await conn.execute('PRAGMA journal_mode=WAL');
  await conn.execute('PRAGMA synchronous=NORMAL');
  await conn.execute('PRAGMA busy_timeout=10000');
  await conn.execute('PRAGMA foreign_keys=ON');
  // Runtime writes configure their acquired SQLx connection in the native
  // transaction command, before BEGIN. SQLite ignores foreign_keys changes
  // made inside an active transaction.
  await resetOutdatedBetaDatabase(conn);
  await dropDeprecatedTables(conn);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_language TEXT NOT NULL DEFAULT 'English',
      target_language TEXT NOT NULL DEFAULT 'Italian',
      view_mode TEXT DEFAULT NULL,
      source_display_text TEXT DEFAULT '',
      source_processing_text TEXT DEFAULT '',
      source_footnotes TEXT DEFAULT '[]',
      document_format TEXT DEFAULT 'plain',
      render_profile TEXT DEFAULT 'plain-text',
      markdown_aware INTEGER DEFAULT 0,
      experimental_import TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // pipelines — supports multiple pipelines per project.
  // source_display_text / source_processing_text / source_footnotes are nullable:
  // when null the pipeline inherits the project-level source text (v1.0 behaviour).
  // Populate them only when a pipeline carries its own document (future feature).
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT 'Default',
      source_language TEXT NOT NULL DEFAULT 'English',
      target_language TEXT NOT NULL DEFAULT 'Italian',
      pipeline_mode TEXT DEFAULT 'standard',
      stages TEXT NOT NULL DEFAULT '[]',
      judge_prompt TEXT DEFAULT '',
      judge_model TEXT DEFAULT '',
      judge_provider TEXT DEFAULT '',
      use_chunking INTEGER DEFAULT 1,
      words_per_chunk INTEGER DEFAULT 0,
      source_display_text TEXT DEFAULT NULL,
      source_processing_text TEXT DEFAULT NULL,
      source_footnotes TEXT DEFAULT NULL,
      review_provider_options TEXT DEFAULT NULL,
      persona TEXT DEFAULT NULL,
      custom_source_language TEXT DEFAULT NULL,
      custom_target_language TEXT DEFAULT NULL,
      blob_budget_tokens INTEGER DEFAULT 0,
      blob_overlap INTEGER DEFAULT 1,
      coherence_prompt TEXT DEFAULT NULL,
      use_phrase_memory INTEGER NOT NULL DEFAULT 0,
      auto_search_phrase_memory INTEGER NOT NULL DEFAULT 1,
      phrase_memory_similarity_threshold REAL NOT NULL DEFAULT 0.75,
      phrase_memory_max_results INTEGER NOT NULL DEFAULT 10,
      run_status TEXT DEFAULT 'idle',
      last_run_config TEXT DEFAULT NULL,
      run_in_progress INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_pipelines_project_id
    ON pipelines(project_id)
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS glossaries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      source_language TEXT DEFAULT '',
      target_language TEXT DEFAULT '',
      workspace_id TEXT DEFAULT NULL,
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
      source_display_text TEXT DEFAULT '',
      source_processing_text TEXT DEFAULT '',
      translation_display_text TEXT DEFAULT '',
      translation_processing_text TEXT DEFAULT '',
      position INTEGER DEFAULT NULL,
      chunk_status TEXT DEFAULT 'ready',
      stage_results TEXT DEFAULT '{}',
      judge_status TEXT DEFAULT 'idle',
      judge_rating TEXT DEFAULT 'fair',
      translation_locked INTEGER DEFAULT 0,
      judge_issues TEXT DEFAULT '[]',
      coherence_result TEXT DEFAULT NULL,
      footnotes TEXT DEFAULT NULL,
      blob_id TEXT DEFAULT NULL,
      blob_order INTEGER DEFAULT 0,
      blob_reference_chunk_ids TEXT DEFAULT NULL,
      pipeline_id TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

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
      context TEXT NOT NULL DEFAULT 'stage',
      workflow TEXT NOT NULL DEFAULT 'translation',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_name_context_workflow
    ON prompt_templates(name, context, workflow)
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      pipeline_id TEXT DEFAULT NULL,
      at TEXT NOT NULL,
      level TEXT NOT NULL,
      scope TEXT NOT NULL,
      message TEXT NOT NULL,
      chunk_id TEXT DEFAULT NULL,
      stage_id TEXT DEFAULT NULL,
      meta TEXT DEFAULT NULL,
      detail TEXT DEFAULT NULL,
      phase TEXT DEFAULT NULL,
      duration_ms INTEGER DEFAULT NULL,
      detail_kind TEXT DEFAULT NULL
    )
  `);
  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_operation_logs_project_id
    ON operation_logs(project_id, at)
  `);
  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_operation_logs_pipeline_id
    ON operation_logs(project_id, pipeline_id, at)
  `);

  // Unique constraint: translations are unique per (pipeline_id, chunk_id) so two pipelines
  // cannot overwrite each other's rows even if chunk IDs happen to collide.
  try {
    await conn.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_translations_pipeline_chunk
        ON translations(pipeline_id, id)
        WHERE pipeline_id IS NOT NULL
    `);
  } catch (error) {
    console.warn('[Glossa] translations pipeline_chunk index failed', error);
  }

  // ── Phrase Memory schema ─────────────────────────────────────────────

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
      memory_extractor_provider TEXT NOT NULL DEFAULT 'openai',
      memory_extractor_model TEXT NOT NULL DEFAULT 'gpt-5-nano',
      memory_extractor_prompt TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )
  `);

  await ensureColumn('projects', 'workspace_id', 'TEXT REFERENCES workspaces(id)');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS phrase_memory (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      source_phrase TEXT NOT NULL,
      target_phrase TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      source_language TEXT NOT NULL,
      target_language TEXT NOT NULL,
      author TEXT,
      work TEXT,
      domain TEXT,
      tags TEXT,
      notes TEXT,
      chunk_id TEXT,
      project_id TEXT REFERENCES projects(id),
      embedding BLOB NOT NULL,
      embedding_model TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await ensureColumn('phrase_memory', 'embedding_model', 'TEXT');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS source_phrase_embeddings (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      chunk_id TEXT,
      source_phrase TEXT NOT NULL,
      embedding BLOB NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_phrase_memory_workspace_id
    ON phrase_memory(workspace_id)
  `);

  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_phrase_memory_chunk_project
    ON phrase_memory(chunk_id, project_id)
  `);

  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_source_phrase_embeddings_chunk_project
    ON source_phrase_embeddings(chunk_id, project_id)
  `);

  const wsKeyCheck = await conn.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM app_settings WHERE key = 'active_workspace_id'`
  );
  if ((wsKeyCheck[0]?.count ?? 0) === 0) {
    await conn.execute(
      `INSERT INTO app_settings (key, value) VALUES ('active_workspace_id', '')`
    );
  }

  const workspaceCheck = await conn.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count FROM workspaces`
  );
  if ((workspaceCheck[0]?.count ?? 0) === 0) {
    await conn.execute(`
      INSERT OR IGNORE INTO workspaces (
        id, name, description, embedding_model,
        memory_extractor_provider, memory_extractor_model, memory_extractor_prompt,
        created_at
      )
      VALUES ('ws_default', 'Default', NULL, 'text-embedding-3-small', $1, $2, $3, datetime('now'))
    `, [
      DEFAULT_MEMORY_EXTRACTOR_PROVIDER,
      DEFAULT_MEMORY_EXTRACTOR_MODEL,
      DEFAULT_MEMORY_EXTRACTOR_PROMPT,
    ]);
    await conn.execute(`
      UPDATE projects
      SET workspace_id = 'ws_default'
      WHERE workspace_id IS NULL OR workspace_id = ''
    `);
    await conn.execute(`
      UPDATE app_settings
      SET value = 'ws_default'
      WHERE key = 'active_workspace_id' AND (value IS NULL OR value = '')
    `);
  }

  await conn.execute(
    `UPDATE workspaces
     SET
       memory_extractor_provider = COALESCE(NULLIF(memory_extractor_provider, ''), $1),
       memory_extractor_model = COALESCE(NULLIF(memory_extractor_model, ''), $2),
       memory_extractor_prompt = COALESCE(NULLIF(memory_extractor_prompt, ''), $3)`,
    [
      DEFAULT_MEMORY_EXTRACTOR_PROVIDER,
      DEFAULT_MEMORY_EXTRACTOR_MODEL,
      DEFAULT_MEMORY_EXTRACTOR_PROMPT,
    ],
  );

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      chunk_id TEXT NOT NULL,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'comment',
      content TEXT NOT NULL DEFAULT '',
      anchor_text TEXT DEFAULT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_annotations_chunk
    ON annotations(pipeline_id, chunk_id)
  `);

  // This DDL belongs here even though its consumers are native commands:
  // TypeScript is the sole schema owner for glossa.db.
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS custom_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      requires_api_key INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await conn.execute(
    `INSERT INTO app_settings (key, value)
     VALUES ('schema_version', $1)
     ON CONFLICT(key) DO UPDATE SET value = $1`,
    [CURRENT_SCHEMA_VERSION],
  );

  console.log('[Glossa] Database initialized');
}

// ── Generic query helpers ────────────────────────────────────────────

export async function execute(query: string, params: unknown[] = []): Promise<void> {
  await getDb();
  await invoke('execute_transaction', {
    db: DB_URL,
    statements: [{ query, params }],
  });
}

export async function select<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const conn = await getDb();
  return conn.select<T[]>(query, params);
}

export async function runInTransaction<T>(
  fn: (run: (query: string, params?: unknown[]) => Promise<void>) => Promise<T>,
): Promise<T> {
  await getDb();
  const statements: Array<{ query: string; params: unknown[] }> = [];
  // Tauri SQL uses a pool, so BEGIN/COMMIT issued from JS can land on
  // different SQLite connections and deadlock. Stage writes here; the
  // native command executes them on one connection inside a real transaction.
  const run = async (query: string, params: unknown[] = []) => {
    statements.push({ query, params });
  };

  const result = await fn(run);
  if (statements.length > 0) {
    await invoke('execute_transaction', {
      db: DB_URL,
      statements,
    });
  }
  return result;
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

// ── Operation Logs ───────────────────────────────────────────────────

const MAX_OPERATION_LOG_ENTRIES = 2000;
const MAX_DETAIL_LENGTH = 500_000;

const VALID_PHASES = new Set(['start', 'end', 'retry', 'cache']);
const VALID_DETAIL_KINDS = new Set(['prompt', 'json', 'error', 'note']);

interface DbOperationLogRow {
  id: string;
  project_id: string;
  pipeline_id: string;
  at: string;
  level: string;
  scope: string;
  message: string;
  chunk_id: string | null;
  stage_id: string | null;
  meta: string | null;
  detail: string | null;
  phase: string | null;
  duration_ms: number | null;
  detail_kind: string | null;
}

export interface PersistedLogEntry {
  id: string;
  at: string;
  level: string;
  scope: string;
  message: string;
  chunkId?: string;
  stageId?: string;
  meta?: Record<string, unknown>;
  detail?: string;
  phase?: string;
  durationMs?: number;
  detailKind?: string;
}

export async function saveOperationLogEntry(
  projectId: string,
  pipelineId: string,
  entry: PersistedLogEntry,
): Promise<void> {
  await execute(
    `INSERT OR IGNORE INTO operation_logs
       (id, project_id, pipeline_id, at, level, scope, message, chunk_id, stage_id, meta, detail, phase, duration_ms, detail_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      entry.id,
      projectId,
      pipelineId,
      entry.at,
      entry.level,
      entry.scope,
      entry.message,
      entry.chunkId ?? null,
      entry.stageId ?? null,
      entry.meta ? JSON.stringify(entry.meta) : null,
      entry.detail ? entry.detail.slice(0, MAX_DETAIL_LENGTH) : null,
      entry.phase ?? null,
      entry.durationMs ?? null,
      entry.detailKind ?? null,
    ],
  );
  await execute(
    `DELETE FROM operation_logs
     WHERE project_id = $1
       AND pipeline_id = $2
       AND id NOT IN (
         SELECT id FROM operation_logs
         WHERE project_id = $1
           AND pipeline_id = $2
         ORDER BY at DESC
         LIMIT $3
       )`,
    [projectId, pipelineId, MAX_OPERATION_LOG_ENTRIES],
  );
}

export async function loadOperationLogs(projectId: string, pipelineId: string): Promise<PersistedLogEntry[]> {
  await execute(
    `DELETE FROM operation_logs
     WHERE project_id = $1
       AND pipeline_id = $2
       AND id NOT IN (
         SELECT id FROM operation_logs
         WHERE project_id = $1
           AND pipeline_id = $2
         ORDER BY at DESC
         LIMIT $3
       )`,
    [projectId, pipelineId, MAX_OPERATION_LOG_ENTRIES],
  );
  const rows = await select<DbOperationLogRow>(
    `SELECT * FROM operation_logs WHERE project_id = $1 AND pipeline_id = $2 ORDER BY at ASC`,
    [projectId, pipelineId],
  );
  return rows.map((row) => ({
    id: row.id,
    at: row.at,
    level: row.level,
    scope: row.scope,
    message: row.message,
    ...(row.chunk_id ? { chunkId: row.chunk_id } : {}),
    ...(row.stage_id ? { stageId: row.stage_id } : {}),
    ...(row.meta ? { meta: JSON.parse(row.meta) as Record<string, unknown> } : {}),
    ...(row.detail ? { detail: row.detail } : {}),
    ...(row.phase && VALID_PHASES.has(row.phase) ? { phase: row.phase } : {}),
    ...(row.duration_ms != null ? { durationMs: row.duration_ms } : {}),
    ...(row.detail_kind && VALID_DETAIL_KINDS.has(row.detail_kind) ? { detailKind: row.detail_kind } : {}),
  }));
}

export async function clearOperationLogs(projectId: string, pipelineId: string): Promise<void> {
  await execute('DELETE FROM operation_logs WHERE project_id = $1 AND pipeline_id = $2', [projectId, pipelineId]);
}
