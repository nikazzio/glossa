import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';

let db: Database | null = null;
let dbUrl: string | null = null;

interface DataDirStatus {
  path: string;
  isOverride: boolean;
}

/**
 * tauri-plugin-sql resolves a relative "sqlite:glossa.db" URL against the OS
 * default app config dir internally — it has no notion of a configurable
 * data location. Ask the backend (which does, via storage_config.rs) for the
 * resolved absolute path first, so a configured override actually takes
 * effect for the live connection, not just for backend-only file operations.
 */
async function resolveDbUrl(): Promise<string> {
  try {
    const status = await invoke<DataDirStatus>('get_data_dir');
    if (!status?.path) return 'sqlite:glossa.db';
    const trimmedPath = status.path.replace(/[/\\]+$/, '');
    const separator = trimmedPath.includes('\\') ? '\\' : '/';
    return `sqlite:${trimmedPath}${separator}glossa.db`;
  } catch {
    // Falls back to the plugin's own relative-path resolution (OS default
    // app config dir) if the backend command is unavailable for any reason.
    return 'sqlite:glossa.db';
  }
}

async function getDb(): Promise<Database> {
  if (!db) {
    dbUrl = await resolveDbUrl();
    db = await Database.load(dbUrl);
  }
  return db;
}

/**
 * Opens the connection used by the rest of this module. Rust owns the schema
 * now (sqlx migrations run at native startup, before the webview exists, see
 * #211) — this only configures the connection's own pragmas, it never
 * creates or resets tables.
 */
export async function initDatabase(): Promise<void> {
  const conn = await getDb();

  await conn.execute('PRAGMA journal_mode=WAL');
  await conn.execute('PRAGMA synchronous=NORMAL');
  await conn.execute('PRAGMA busy_timeout=10000');
  await conn.execute('PRAGMA foreign_keys=ON');

  console.log('[Glossa] Database connected');
}

// ── Generic query helpers ────────────────────────────────────────────

export async function execute(query: string, params: unknown[] = []): Promise<void> {
  await getDb();
  await invoke('execute_transaction', {
    db: dbUrl,
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
      db: dbUrl,
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
}

export async function loadOperationLogs(projectId: string, pipelineId: string): Promise<PersistedLogEntry[]> {
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
