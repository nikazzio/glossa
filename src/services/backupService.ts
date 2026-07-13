import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { select, runInTransaction } from './dbService';
import { confirm } from '../stores/confirmStore';

const SCHEMA_VERSION = 1;
const GLOSSA_VERSION = '0.9.0';

// dbService.ts stores its own DB-migration marker under this app_settings key
// (unrelated to SCHEMA_VERSION above). Importing an old backup must never
// overwrite it — doing so makes the running app's next startup check think
// the live DB is on an old schema and wipe every table via
// resetOutdatedBetaDatabase().
const DB_MIGRATION_SETTING_KEY = 'schema_version';

// Ordered for FK safety: parents before children for INSERT,
// children before parents for DELETE.
const INSERT_ORDER = [
  'workspaces',
  'glossaries',
  'projects',
  'app_settings',
  'prompt_templates',
  'pipelines',
  'project_glossaries',
  'glossary_entries',
  'translations',
  'phrase_memory',
  'source_phrase_embeddings',
] as const;

const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const ALLOWED_COLUMNS: Record<BackupTable, ReadonlySet<string>> = {
  workspaces:               new Set(['id','name','description','embedding_model','memory_extractor_provider','memory_extractor_model','memory_extractor_prompt','created_at']),
  glossaries:               new Set(['id','name','description','source_language','target_language','created_at']),
  projects:                 new Set(['id','name','source_language','target_language','workspace_id','created_at','updated_at','view_mode','source_display_text']),
  app_settings:             new Set(['key','value']),
  prompt_templates:         new Set(['id','name','prompt','default_model','default_provider','created_at','updated_at','context']),
  pipelines:                new Set(['id','project_id','name','source_language','target_language','pipeline_mode','stages','judge_prompt','judge_model','judge_provider','use_chunking','words_per_chunk','source_display_text','source_processing_text','source_footnotes','review_provider_options','persona','custom_source_language','custom_target_language','blob_budget_tokens','blob_overlap','coherence_prompt','run_status','last_run_config','run_in_progress','created_at','updated_at','use_phrase_memory','auto_search_phrase_memory','phrase_memory_similarity_threshold','phrase_memory_max_results']),
  project_glossaries:       new Set(['project_id','glossary_id']),
  glossary_entries:         new Set(['id','glossary_id','term','translation','notes','context','created_at']),
  translations:             new Set(['id','project_id','source_display_text','source_processing_text','translation_display_text','translation_processing_text','position','chunk_status','stage_results','judge_status','judge_rating','translation_locked','judge_issues','created_at','coherence_result','footnotes','blob_id','blob_order','blob_reference_chunk_ids','pipeline_id','notes']),
  phrase_memory:            new Set(['id','workspace_id','source_phrase','target_phrase','confidence','source_language','target_language','author','work','domain','tags','notes','chunk_id','project_id','embedding','created_at']),
  source_phrase_embeddings: new Set(['id','project_id','chunk_id','source_phrase','embedding','created_at']),
};

const DELETE_ORDER = [
  'source_phrase_embeddings',
  'phrase_memory',
  'translations',
  'glossary_entries',
  'project_glossaries',
  'pipelines',
  'projects',
  'glossaries',
  'prompt_templates',
  'app_settings',
  'workspaces',
] as const;

type BackupTable = typeof INSERT_ORDER[number];

interface BackupPayload {
  glossa_version: string;
  schema_version: number;
  exported_at: string;
  tables: Record<BackupTable, Record<string, unknown>[]>;
}

export async function exportWorkspace(): Promise<void> {
  const now = new Date().toISOString();
  const dateSlug = now.slice(0, 10);

  const path = await save({
    title: 'Esporta backup workspace',
    defaultPath: `glossa-backup-${dateSlug}.glossa-backup`,
    filters: [{ name: 'Glossa Backup', extensions: ['glossa-backup'] }],
  });
  if (!path) return;

  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of INSERT_ORDER) {
    tables[table] = await select<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }

  const payload: BackupPayload = {
    glossa_version: GLOSSA_VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: now,
    tables: tables as BackupPayload['tables'],
  };

  await writeTextFile(path, JSON.stringify(payload, null, 2));
}

export async function importWorkspace(t: (key: string) => string): Promise<boolean> {
  const path = await open({
    title: 'Importa backup workspace',
    filters: [
      { name: 'Glossa Backup', extensions: ['glossa-backup', 'json'] },
      { name: 'Tutti i file', extensions: ['*'] },
    ],
    multiple: false,
  });
  if (!path) return false;

  const raw = await readTextFile(path as string);
  const payload = validateBackup(JSON.parse(raw));

  const ok = await confirm({
    title: t('settings.backupImportConfirmTitle'),
    message: t('settings.backupImportConfirmMessage'),
    confirmLabel: t('settings.backupImportConfirm'),
    danger: true,
  });
  if (!ok) return false;

  await runInTransaction(async (run) => {
    for (const table of DELETE_ORDER) {
      await run(`DELETE FROM ${table}`);
    }
    for (const table of INSERT_ORDER) {
      const rows = payload.tables[table] ?? [];
      const allowed = ALLOWED_COLUMNS[table];
      for (const row of rows) {
        if (table === 'app_settings' && row.key === DB_MIGRATION_SETTING_KEY) {
          continue;
        }
        const cols = Object.keys(row).filter(
          (c) => allowed.has(c) && SAFE_COL.test(c),
        );
        if (cols.length === 0) continue;
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await run(
          `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          cols.map((c) => row[c]),
        );
      }
    }
  });

  return true;
}

function validateBackup(json: unknown): BackupPayload {
  if (typeof json !== 'object' || json === null) {
    throw new Error('invalid_backup');
  }
  const p = json as Record<string, unknown>;
  if (typeof p.schema_version !== 'number') {
    throw new Error('invalid_backup');
  }
  if (p.schema_version > SCHEMA_VERSION) {
    throw new Error('incompatible_schema_version');
  }
  if (typeof p.tables !== 'object' || p.tables === null) {
    throw new Error('invalid_backup');
  }
  return p as unknown as BackupPayload;
}
