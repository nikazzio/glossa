import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import {
  DEFAULT_MEMORY_EXTRACTOR_MODEL,
  DEFAULT_MEMORY_EXTRACTOR_PROMPT,
  DEFAULT_MEMORY_EXTRACTOR_PROVIDER,
} from '../constants';

let db: Database | null = null;
const DB_URL = 'sqlite:glossa.db';
const CURRENT_SCHEMA_VERSION = '2026-06-11-annotation-footnote-marker';

const RESETTABLE_OBJECTS = [
  'technique_tags',
  'historical_techniques',
  'source_phrase_embeddings',
  'phrase_memory',
  'phrase_memory_presets',
  'operation_logs',
  'annotations',
  'translations',
  'macro_blocks',
  'project_glossaries',
  'glossary_entries',
  'glossaries',
  'pipelines',
  'pipeline_configs',
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
  'pipeline_configs.words_per_chunk',
  'pipeline_configs.source_text',
  'pipeline_configs.source_display_text',
  'pipeline_configs.source_processing_text',
  'pipeline_configs.source_footnotes',
  'pipeline_configs.document_format',
  'pipeline_configs.render_profile',
  'pipeline_configs.markdown_aware',
  'pipeline_configs.experimental_import',
  'pipeline_configs.review_provider_options',
  'projects.view_mode',
  'projects.source_display_text',
  'projects.source_processing_text',
  'projects.source_footnotes',
  'projects.document_format',
  'projects.render_profile',
  'projects.markdown_aware',
  'projects.experimental_import',
  'translations.position',
  'translations.chunk_status',
  'translations.judge_status',
  'translations.judge_rating',
  'translations.translation_locked',
  'translations.coherence_result',
  'translations.footnotes',
  'translations.source_display_text',
  'translations.source_processing_text',
  'translations.translation_display_text',
  'translations.translation_processing_text',
  'translations.pipeline_id',
  'prompt_templates.context',
  'pipeline_configs.persona',
  'pipeline_configs.custom_source_language',
  'pipeline_configs.custom_target_language',
  'pipeline_configs.run_in_progress',
  'pipeline_configs.run_status',
  'pipeline_configs.last_run_config',
  'pipeline_configs.blob_budget_tokens',
  'pipeline_configs.blob_overlap',
  'translations.blob_id',
  'translations.blob_order',
  'translations.blob_reference_chunk_ids',
  'operation_logs.phase',
  'operation_logs.duration_ms',
  'operation_logs.detail_kind',
  'pipeline_configs.pipeline_mode',
  'pipelines.pipeline_mode',
  'pipelines.use_chunking',
  'pipelines.words_per_chunk',
  'pipelines.review_provider_options',
  'pipelines.persona',
  'pipelines.custom_source_language',
  'pipelines.custom_target_language',
  'pipelines.blob_budget_tokens',
  'pipelines.blob_overlap',
  'pipelines.run_status',
  'pipelines.last_run_config',
  'pipelines.run_in_progress',
  'pipelines.source_display_text',
  'pipelines.source_processing_text',
  'pipelines.source_footnotes',
  'pipelines.coherence_prompt',
  'pipelines.use_phrase_memory',
  'pipelines.auto_search_phrase_memory',
  'pipelines.phrase_memory_similarity_threshold',
  'pipelines.phrase_memory_max_results',
  'annotations.footnote_marker',
]);

const VALID_COLUMN_DEFINITION = /^(INTEGER|TEXT|REAL|BLOB|NUMERIC)(\s+NOT\s+NULL)?(\s+DEFAULT\s+('[^']*'|NULL|-?\d+(\.\d+)?))?$/i;

export function validateColumnDefinition(definition: string): void {
  if (!VALID_COLUMN_DEFINITION.test(definition)) {
    throw new Error(`[dbService] Invalid column definition: "${definition}"`);
  }
}

export async function ensureColumn(table: string, column: string, definition: string): Promise<void> {
  if (!ALLOWED_MIGRATIONS.has(`${table}.${column}`)) {
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
  // Warm up additional pool connections with the same busy_timeout
  // so write contention doesn't hit connections with the shorter default.
  for (let i = 0; i < 8; i++) {
    await execute('PRAGMA busy_timeout=10000');
  }
  await resetOutdatedBetaDatabase(conn);

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
      words_per_chunk INTEGER DEFAULT 0,
      source_text TEXT DEFAULT '',
      source_display_text TEXT DEFAULT '',
      source_processing_text TEXT DEFAULT '',
      source_footnotes TEXT DEFAULT '[]',
      document_format TEXT DEFAULT 'plain',
      render_profile TEXT DEFAULT 'plain-text',
      markdown_aware INTEGER DEFAULT 0,
      experimental_import TEXT DEFAULT NULL,
      review_provider_options TEXT DEFAULT NULL,
      run_status TEXT DEFAULT 'idle'
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

  // pipelines — replaces pipeline_configs: supports multiple pipelines per project.
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('pipeline_configs', 'words_per_chunk', "INTEGER DEFAULT 0");
  await ensureColumn('pipeline_configs', 'source_text', "TEXT DEFAULT ''");
  await ensureColumn('pipeline_configs', 'source_display_text', "TEXT DEFAULT ''");
  await ensureColumn('pipeline_configs', 'source_processing_text', "TEXT DEFAULT ''");
  await ensureColumn('pipeline_configs', 'source_footnotes', "TEXT DEFAULT '[]'");
  await ensureColumn('pipeline_configs', 'document_format', "TEXT DEFAULT 'plain'");
  await ensureColumn('pipeline_configs', 'render_profile', "TEXT DEFAULT 'plain-text'");
  await ensureColumn('pipeline_configs', 'markdown_aware', 'INTEGER DEFAULT 0');
  await ensureColumn('pipeline_configs', 'experimental_import', 'TEXT DEFAULT NULL');
  await ensureColumn('pipeline_configs', 'review_provider_options', 'TEXT DEFAULT NULL');
  await ensureColumn('pipeline_configs', 'persona', 'TEXT DEFAULT NULL');
  await ensureColumn('pipeline_configs', 'custom_source_language', 'TEXT DEFAULT NULL');
  await ensureColumn('pipeline_configs', 'custom_target_language', 'TEXT DEFAULT NULL');
  await ensureColumn('projects', 'view_mode', 'TEXT DEFAULT NULL');
  await ensureColumn('translations', 'position', 'INTEGER DEFAULT NULL');
  await ensureColumn('translations', 'chunk_status', "TEXT DEFAULT 'ready'");
  await ensureColumn('translations', 'judge_status', "TEXT DEFAULT 'idle'");
  await ensureColumn('translations', 'judge_rating', "TEXT DEFAULT 'fair'");
  await ensureColumn('translations', 'translation_locked', 'INTEGER DEFAULT 0');
  await ensureColumn('translations', 'source_display_text', "TEXT DEFAULT ''");
  await ensureColumn('translations', 'source_processing_text', "TEXT DEFAULT ''");
  await ensureColumn('translations', 'translation_display_text', "TEXT DEFAULT ''");
  await ensureColumn('translations', 'translation_processing_text', "TEXT DEFAULT ''");

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

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      at TEXT NOT NULL,
      level TEXT NOT NULL,
      scope TEXT NOT NULL,
      message TEXT NOT NULL,
      chunk_id TEXT DEFAULT NULL,
      stage_id TEXT DEFAULT NULL,
      meta TEXT DEFAULT NULL,
      detail TEXT DEFAULT NULL
    )
  `);
  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_operation_logs_project_id
    ON operation_logs(project_id, at)
  `);
  await ensureColumn('translations', 'coherence_result', 'TEXT DEFAULT NULL');
  await ensureColumn('translations', 'footnotes', 'TEXT DEFAULT NULL');
  await ensureColumn('translations', 'blob_id', 'TEXT DEFAULT NULL');
  await ensureColumn('translations', 'blob_order', 'INTEGER DEFAULT 0');
  await ensureColumn('translations', 'blob_reference_chunk_ids', 'TEXT DEFAULT NULL');
  await ensureColumn('pipeline_configs', 'blob_budget_tokens', 'INTEGER DEFAULT 0');
  await ensureColumn('pipeline_configs', 'blob_overlap', 'INTEGER DEFAULT 1');
  await ensureColumn('operation_logs', 'phase', 'TEXT DEFAULT NULL');
  await ensureColumn('operation_logs', 'duration_ms', 'INTEGER DEFAULT NULL');
  await ensureColumn('operation_logs', 'detail_kind', 'TEXT DEFAULT NULL');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS macro_blocks (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      blob_index INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn('prompt_templates', 'context', "TEXT NOT NULL DEFAULT 'stage'");
  await ensureColumn('pipeline_configs', 'run_in_progress', 'INTEGER DEFAULT 0');
  await ensureColumn('pipeline_configs', 'run_status', "TEXT DEFAULT 'idle'");
  await ensureColumn('pipeline_configs', 'last_run_config', 'TEXT DEFAULT NULL');
  await ensureColumn('pipeline_configs', 'pipeline_mode', "TEXT DEFAULT 'standard'");
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

  // Migration: rimuovi glossari fantasma auto-creati per progetto (senza voci)
  // Questi erano creati automaticamente da saveProjectGlossary ad ogni salvataggio.
  try {
    await conn.execute(`
      DELETE FROM glossaries
      WHERE id GLOB 'glossary-proj-*'
        AND NOT EXISTS (
          SELECT 1 FROM glossary_entries WHERE glossary_id = glossaries.id
        )
    `);
  } catch (error) {
    console.warn('[Glossa] Ghost glossary cleanup migration failed', error);
  }

  // ── Multi-pipeline migration ─────────────────────────────────────────

  // Add source-text columns to projects (project owns the document, pipelines own the config).
  await ensureColumn('projects', 'source_display_text', "TEXT DEFAULT ''");
  await ensureColumn('projects', 'source_processing_text', "TEXT DEFAULT ''");
  await ensureColumn('projects', 'source_footnotes', "TEXT DEFAULT '[]'");
  await ensureColumn('projects', 'document_format', "TEXT DEFAULT 'plain'");
  await ensureColumn('projects', 'render_profile', "TEXT DEFAULT 'plain-text'");
  await ensureColumn('projects', 'markdown_aware', 'INTEGER DEFAULT 0');
  await ensureColumn('projects', 'experimental_import', 'TEXT DEFAULT NULL');

  // Add pipeline_id to translations (translations belong to a pipeline, not a project).
  await ensureColumn('translations', 'pipeline_id', 'TEXT DEFAULT NULL');

  // Ensure all optional pipelines columns exist on older DBs that predate them.
  await ensureColumn('pipelines', 'pipeline_mode', "TEXT DEFAULT 'standard'");
  await ensureColumn('pipelines', 'use_chunking', 'INTEGER DEFAULT 1');
  await ensureColumn('pipelines', 'words_per_chunk', 'INTEGER DEFAULT 0');
  await ensureColumn('pipelines', 'review_provider_options', 'TEXT DEFAULT NULL');
  await ensureColumn('pipelines', 'persona', 'TEXT DEFAULT NULL');
  await ensureColumn('pipelines', 'custom_source_language', 'TEXT DEFAULT NULL');
  await ensureColumn('pipelines', 'custom_target_language', 'TEXT DEFAULT NULL');
  await ensureColumn('pipelines', 'blob_budget_tokens', 'INTEGER DEFAULT 0');
  await ensureColumn('pipelines', 'blob_overlap', 'INTEGER DEFAULT 1');
  await ensureColumn('pipelines', 'coherence_prompt', 'TEXT DEFAULT NULL');
  await ensureColumn('pipelines', 'use_phrase_memory', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('pipelines', 'auto_search_phrase_memory', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('pipelines', 'phrase_memory_similarity_threshold', 'REAL NOT NULL DEFAULT 0.75');
  await ensureColumn('pipelines', 'phrase_memory_max_results', 'INTEGER NOT NULL DEFAULT 10');
  await ensureColumn('pipelines', 'run_status', "TEXT DEFAULT 'idle'");
  await ensureColumn('pipelines', 'last_run_config', 'TEXT DEFAULT NULL');
  await ensureColumn('pipelines', 'run_in_progress', 'INTEGER DEFAULT 0');
  await ensureColumn('pipelines', 'source_display_text', 'TEXT DEFAULT NULL');
  await ensureColumn('pipelines', 'source_processing_text', 'TEXT DEFAULT NULL');
  await ensureColumn('pipelines', 'source_footnotes', 'TEXT DEFAULT NULL');

  // Populate pipelines from pipeline_configs (one-time, idempotent via INSERT OR IGNORE).
  try {
    await conn.execute(`
      INSERT OR IGNORE INTO pipelines (
        id, project_id, name, source_language, target_language, pipeline_mode,
        stages, judge_prompt, judge_model, judge_provider,
        use_chunking, words_per_chunk,
        review_provider_options, persona, custom_source_language, custom_target_language,
        blob_budget_tokens, blob_overlap, run_status, last_run_config, run_in_progress
      )
      SELECT
        pc.id, pc.project_id, 'Default', p.source_language, p.target_language,
        COALESCE(pc.pipeline_mode, 'standard'),
        pc.stages,
        COALESCE(pc.judge_prompt, ''), COALESCE(pc.judge_model, ''), COALESCE(pc.judge_provider, ''),
        COALESCE(pc.use_chunking, 1), COALESCE(pc.words_per_chunk, 0),
        pc.review_provider_options, pc.persona, pc.custom_source_language, pc.custom_target_language,
        COALESCE(pc.blob_budget_tokens, 0), COALESCE(pc.blob_overlap, 1),
        COALESCE(pc.run_status, 'idle'), pc.last_run_config, COALESCE(pc.run_in_progress, 0)
      FROM pipeline_configs pc
      JOIN projects p ON p.id = pc.project_id
    `);
  } catch (error) {
    console.warn('[Glossa] Pipeline migration from pipeline_configs failed', error);
  }

  // Copy source text from pipeline_configs to projects (only where still empty).
  try {
    await conn.execute(`
      UPDATE projects
      SET
        source_display_text    = COALESCE(pc.source_display_text, ''),
        source_processing_text = COALESCE(pc.source_processing_text, ''),
        source_footnotes       = COALESCE(pc.source_footnotes, '[]'),
        document_format        = COALESCE(pc.document_format, 'plain'),
        render_profile         = COALESCE(pc.render_profile, 'plain-text'),
        markdown_aware         = COALESCE(pc.markdown_aware, 0),
        experimental_import    = pc.experimental_import
      FROM pipeline_configs AS pc
      WHERE pc.project_id = projects.id
        AND (projects.source_display_text IS NULL OR projects.source_display_text = '')
    `);
  } catch (error) {
    console.warn('[Glossa] Source text migration to projects failed', error);
  }

  // Set pipeline_id in translations from the project-to-pipeline mapping.
  try {
    await conn.execute(`
      UPDATE translations
      SET pipeline_id = (SELECT id FROM pipelines WHERE project_id = translations.project_id LIMIT 1)
      WHERE pipeline_id IS NULL
    `);
  } catch (error) {
    console.warn('[Glossa] pipeline_id migration in translations failed', error);
  }

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

  await conn.execute(
    `INSERT INTO app_settings (key, value)
     VALUES ('schema_version', $1)
     ON CONFLICT(key) DO UPDATE SET value = $1`,
    [CURRENT_SCHEMA_VERSION],
  );

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

  for (const col of [
    "ALTER TABLE workspaces ADD COLUMN memory_extractor_provider TEXT NOT NULL DEFAULT 'openai'",
    "ALTER TABLE workspaces ADD COLUMN memory_extractor_model TEXT NOT NULL DEFAULT 'gpt-5-nano'",
    "ALTER TABLE workspaces ADD COLUMN memory_extractor_prompt TEXT NOT NULL DEFAULT ''",
  ]) {
    try {
      await conn.execute(col);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err;
    }
  }

  try {
    await conn.execute(
      `ALTER TABLE projects ADD COLUMN workspace_id TEXT REFERENCES workspaces(id)`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err;
  }

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
      created_at TEXT NOT NULL
    )
  `);

  try {
    await conn.execute(
      'ALTER TABLE phrase_memory ADD COLUMN confidence REAL NOT NULL DEFAULT 1.0',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err;
  }

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

  for (const col of [
    'ALTER TABLE pipelines ADD COLUMN use_phrase_memory INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE pipelines ADD COLUMN auto_search_phrase_memory INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE pipelines ADD COLUMN phrase_memory_similarity_threshold REAL NOT NULL DEFAULT 0.75',
    'ALTER TABLE pipelines ADD COLUMN phrase_memory_max_results INTEGER NOT NULL DEFAULT 10',
  ]) {
    try {
      await conn.execute(col);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err;
    }
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS historical_techniques (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_language TEXT NOT NULL,
      target_language TEXT NOT NULL,
      author TEXT,
      work TEXT,
      year TEXT,
      embedding_source BLOB NOT NULL,
      embedding_translated BLOB NOT NULL,
      source_chunk_id TEXT,
      translation_stale INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS technique_tags (
      technique_id TEXT NOT NULL REFERENCES historical_techniques(id),
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (technique_id, category, value)
    )
  `);

  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_technique_tags_category_value
    ON technique_tags(category, value)
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
      footnote_marker TEXT DEFAULT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await conn.execute(`
    CREATE INDEX IF NOT EXISTS idx_annotations_chunk
    ON annotations(pipeline_id, chunk_id)
  `);
  try {
    await conn.execute(`ALTER TABLE annotations ADD COLUMN footnote_marker TEXT DEFAULT NULL`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw err;
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

// ── Operation Logs ───────────────────────────────────────────────────

const MAX_OPERATION_LOG_ENTRIES = 2000;
const MAX_DETAIL_LENGTH = 500_000;

const VALID_PHASES = new Set(['start', 'end', 'retry', 'cache']);
const VALID_DETAIL_KINDS = new Set(['prompt', 'json', 'error', 'note']);

interface DbOperationLogRow {
  id: string;
  project_id: string;
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

export async function saveOperationLogEntry(projectId: string, entry: PersistedLogEntry): Promise<void> {
  await execute(
    `INSERT OR IGNORE INTO operation_logs
       (id, project_id, at, level, scope, message, chunk_id, stage_id, meta, detail, phase, duration_ms, detail_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      entry.id,
      projectId,
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
       AND id NOT IN (
         SELECT id FROM operation_logs
         WHERE project_id = $1
         ORDER BY at DESC
         LIMIT $2
       )`,
    [projectId, MAX_OPERATION_LOG_ENTRIES],
  );
}

export async function loadOperationLogs(projectId: string): Promise<PersistedLogEntry[]> {
  await execute(
    `DELETE FROM operation_logs
     WHERE project_id = $1
       AND id NOT IN (
         SELECT id FROM operation_logs
         WHERE project_id = $1
         ORDER BY at DESC
         LIMIT $2
       )`,
    [projectId, MAX_OPERATION_LOG_ENTRIES],
  );
  const rows = await select<DbOperationLogRow>(
    `SELECT * FROM operation_logs WHERE project_id = $1 ORDER BY at ASC`,
    [projectId],
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

export async function clearOperationLogs(projectId: string): Promise<void> {
  await execute('DELETE FROM operation_logs WHERE project_id = $1', [projectId]);
}
