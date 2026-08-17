import { invoke } from '@tauri-apps/api/core';
import { select, runInTransaction } from './dbService';
import { logger } from '../utils/logger';
import { confirm } from '../stores/confirmStore';
import {
  BACKUP_TABLES,
  backupPayloadSchema,
  type BackupPayload,
  type BackupTable,
  type DownloadedSource,
} from '../schemas/externalData';

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
const INSERT_ORDER = BACKUP_TABLES;

const SAFE_COL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const ALLOWED_COLUMNS: Record<BackupTable, ReadonlySet<string>> = {
  workspaces:               new Set(['id','name','description','embedding_model','memory_extractor_provider','memory_extractor_model','memory_extractor_prompt','created_at']),
  glossaries:               new Set(['id','name','description','source_language','target_language','created_at']),
  projects:                 new Set(['id','name','source_language','target_language','workspace_id','created_at','updated_at','source_display_text']),
  app_settings:             new Set(['key','value']),
  prompt_templates:         new Set(['id','name','prompt','default_model','default_provider','created_at','updated_at','context']),
  pipelines:                new Set(['id','project_id','name','source_language','target_language','pipeline_mode','stages','judge_prompt','judge_model','judge_provider','use_chunking','words_per_chunk','source_display_text','source_processing_text','source_footnotes','review_provider_options','persona','custom_source_language','custom_target_language','blob_budget_tokens','blob_overlap','coherence_prompt','run_status','last_run_config','run_in_progress','created_at','updated_at','use_phrase_memory','auto_search_phrase_memory','phrase_memory_similarity_threshold','phrase_memory_max_results']),
  project_glossaries:       new Set(['project_id','glossary_id']),
  glossary_entries:         new Set(['id','glossary_id','term','translation','notes','context','created_at']),
  translations:             new Set(['id','project_id','source_display_text','source_processing_text','translation_display_text','translation_processing_text','position','chunk_status','stage_results','judge_status','judge_rating','translation_locked','judge_issues','created_at','coherence_result','footnotes','blob_id','blob_order','blob_reference_chunk_ids','pipeline_id','notes']),
  phrase_memory:            new Set(['id','workspace_id','source_phrase','target_phrase','confidence','source_language','target_language','author','work','domain','tags','notes','chunk_id','project_id','embedding','created_at']),
  source_phrase_embeddings: new Set(['id','project_id','chunk_id','source_phrase','embedding','created_at']),
  // La scheda dell'opera si conserva, i suoi file no: si riscaricano (D31).
  sources:                  new Set(['id','title','kind','primary_language','description','external_ref','status','trashed_at','created_at','updated_at']),
  source_versions:          new Set(['id','source_id','label','version_kind','source_url','metadata','is_primary','created_at','download_policy','image_service_profile','homepage_url','download_allowed','expected_asset_count','size_cap']),
  workspace_sources:        new Set(['workspace_id','source_id','linked_at']),
  transcription_documents:  new Set(['id','source_version_id','workspace_id','title','status','trashed_at','created_at','updated_at']),
  transcription_segments:   new Set(['id','document_id','position','label','asset_id','approved_revision_id']),
  transcription_revisions:  new Set(['id','segment_id','revision_number','text','created_by','derived_from_revision_id','content_hash','created_at']),
  translation_origins:      new Set(['project_id','origin_type','transcription_document_id','source_version_id','import_note']),
  translation_revisions:    new Set(['id','translation_id','revision_number','text','created_by','derived_from_revision_id','content_hash','created_at']),
  provenance_events:        new Set(['id','occurred_at','event_type','entity_type','entity_id','workspace_id','actor','job_id','input_ref','output_ref','config','outcome','duration_ms','provider','model','prompt_version','input_tokens','output_tokens','cached_tokens','estimated_cost','source_language','target_language','error_kind','input_hash','output_hash']),
  derived_metrics:          new Set(['id','metric_key','entity_type','entity_id','workspace_id','value','detail','algorithm_version','input_hash','computed_at']),
  network_profiles:         new Set(['id','name','builtin','values_json','updated_at']),
  library_network_profiles: new Set(['library_key','profile_id']),
};

/**
 * Colonne che puntano a righe che il backup **non porta con sé**: l'asset di
 * un segmento e il lavoro che ha prodotto un fatto.
 *
 * Vanno svuotate al ripristino, altrimenti la chiave esterna rifiuta la riga e
 * `INSERT OR IGNORE` la scarta **in silenzio**: si perderebbero i segmenti di
 * trascrizione legati a un'immagine e tutti i fatti prodotti da un lavoro,
 * cioè proprio il registro che il backup serve a salvare.
 */
const DANGLING_REFS: Partial<Record<BackupTable, readonly string[]>> = {
  transcription_segments: ['asset_id'],
  provenance_events: ['job_id'],
};

const DELETE_ORDER = [
  'source_phrase_embeddings',
  'phrase_memory',
  'derived_metrics',
  'provenance_events',
  'translation_revisions',
  'translations',
  'translation_origins',
  'transcription_revisions',
  'transcription_segments',
  'transcription_documents',
  'library_network_profiles',
  'network_profiles',
  'workspace_sources',
  'source_versions',
  'sources',
  'glossary_entries',
  'project_glossaries',
  'pipelines',
  'projects',
  'glossaries',
  'prompt_templates',
  'app_settings',
  'workspaces',
] as const;

/**
 * Le opere che erano scaricate, con la misura usata (D31).
 *
 * È ciò che rende indolore l'esclusione delle immagini: al ripristino Glossa
 * può proporre «riscarico le dodici opere che avevi?». Si guardano le righe
 * delle pagine, non i file: dopo il ripristino i file non ci sono comunque.
 */
async function downloadedSources(): Promise<DownloadedSource[]> {
  return select<DownloadedSource>(
    `SELECT v.id                                   AS versionId,
            s.title                                AS sourceTitle,
            json_extract(v.metadata, '$.providerKey') AS providerKey,
            v.source_url                           AS manifestUrl,
            MAX(a.size_tag)                        AS sizeTag,
            COUNT(DISTINCT a.page_index)           AS pages
       FROM source_versions v
       JOIN sources s ON s.id = v.source_id
       JOIN assets a  ON a.source_version_id = v.id AND a.kind = 'image' AND a.locality = 'local'
      GROUP BY v.id
      ORDER BY s.title`,
  );
}

export async function exportWorkspace(): Promise<void> {
  const now = new Date().toISOString();

  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of INSERT_ORDER) {
    tables[table] = await select<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }

  const downloaded = await downloadedSources();
  const payload: BackupPayload = {
    glossa_version: GLOSSA_VERSION,
    schema_version: SCHEMA_VERSION,
    exported_at: now,
    tables: tables as BackupPayload['tables'],
    downloaded,
  };

  // Il percorso non attraversa l'interfaccia: la finestra la apre il backend,
  // che scrive anche il file — compresso, con il suo manifesto (#407, D31).
  const written = await invoke<string | null>('write_backup', {
    payload: JSON.stringify(payload),
  });
  logger.info('backup.exported', {
    saved: written !== null,
    tables: INSERT_ORDER.length,
    downloadedSources: downloaded.length,
  });
}

/**
 * Ripristina un backup. Restituisce le opere che erano scaricate, così la
 * schermata può proporre di riprenderle: le immagini non stanno nel backup.
 */
export async function importWorkspace(t: (key: string) => string): Promise<DownloadedSource[] | null> {
  // La finestra e la lettura stanno nel backend (#407): una webview
  // compromessa non può farsi leggere un file a sua scelta.
  const raw = await invoke<string | null>('read_backup');
  if (raw === null) return null;

  const payload = validateBackup(JSON.parse(raw));

  const ok = await confirm({
    title: t('settings.backupImportConfirmTitle'),
    message: t('settings.backupImportConfirmMessage'),
    confirmLabel: t('settings.backupImportConfirm'),
    danger: true,
  });
  if (!ok) return null;

  await runInTransaction(async (run) => {
    for (const table of DELETE_ORDER) {
      if (table === 'app_settings') {
        // Never touch the running DB's migration marker — deleting it here
        // leaves app_settings with no schema_version row at all, which reads
        // as "outdated" on the next boot exactly like a stale value would.
        await run(`DELETE FROM app_settings WHERE key != $1`, [DB_MIGRATION_SETTING_KEY]);
        continue;
      }
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
        const dangling = DANGLING_REFS[table] ?? [];
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await run(
          `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          cols.map((c) => (dangling.includes(c) ? null : row[c])),
        );
      }
    }
  });

  logger.info('backup.restored', {
    tables: INSERT_ORDER.length,
    downloadedSources: payload.downloaded?.length ?? 0,
  });
  return payload.downloaded ?? [];
}

function validateBackup(json: unknown): BackupPayload {
  const parsed = backupPayloadSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('invalid_backup');
  }
  if (parsed.data.schema_version > SCHEMA_VERSION) {
    throw new Error('incompatible_schema_version');
  }
  return parsed.data;
}
