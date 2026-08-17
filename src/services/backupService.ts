/**
 * Il backup del programma intero (#345, #407, D31).
 *
 * **Non è di un workspace**: prende tutte le tabelle e al ripristino le
 * sostituisce tutte. Il file serve a rimettere in piedi Glossa dov'era, non a
 * spostare un lavoro da una macchina all'altra — quello sarà l'esportazione di
 * un workspace, che ha bisogno di identificatori nuovi e delle regole di ambito.
 */
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

/**
 * Le colonne che una tabella ha **adesso**, chieste al database.
 *
 * Prima erano scritte a mano, tabella per tabella, e ogni colonna aggiunta al
 * programma e dimenticata qui spariva al ripristino **in silenzio**: il
 * workspace di un dizionario, l'icona del workspace, il formato di un progetto.
 * Chiedendole al database l'elenco non può restare indietro.
 *
 * Il nome della tabella non arriva mai da fuori — è uno dei nomi dichiarati —
 * e le colonne restano comunque filtrate, perché finiscono dentro la query.
 */
async function liveColumns(table: BackupTable): Promise<ReadonlySet<string>> {
  const rows = await select<{ name: string }>(`PRAGMA table_info(${table})`);
  const names = rows.map((row) => row.name).filter((name) => SAFE_COL.test(name));
  // Nessuna colonna vuol dire che la tabella non c'è: proseguire la
  // scarterebbe tutta senza dire niente. Si smette **prima** di cancellare.
  if (names.length === 0) throw new Error('backup_schema_unreadable');
  return new Set(names);
}

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
            -- La misura più grande **per numero**: come stringhe «900» batte
            -- «2000», e il ripristino riscaricherebbe a una misura diversa da
            -- quella che c'era. «max» è la più grande di tutte per definizione.
            COALESCE(
              MAX(CASE WHEN a.size_tag = 'max' THEN 'max' END),
              CAST(MAX(CAST(a.size_tag AS INTEGER)) AS TEXT)
            )                                      AS sizeTag,
            COUNT(DISTINCT a.page_index)           AS pages
       FROM source_versions v
       JOIN sources s ON s.id = v.source_id
       JOIN assets a  ON a.source_version_id = v.id AND a.kind = 'image' AND a.locality = 'local'
      GROUP BY v.id
      ORDER BY s.title`,
  );
}

/**
 * Scrive il backup. Restituisce `false` se la finestra di salvataggio è stata
 * chiusa senza scegliere: annullare non è un errore, ma nemmeno un successo da
 * annunciare.
 */
export async function writeBackup(): Promise<boolean> {
  const now = new Date().toISOString();

  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const table of INSERT_ORDER) {
    tables[table] = await select<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }

  const downloaded = await downloadedSources();
  const payload: BackupPayload = {
    glossa_version: __APP_VERSION__,
    schema_version: SCHEMA_VERSION,
    exported_at: now,
    tables: tables as BackupPayload['tables'],
    downloaded,
  };

  // Il percorso non attraversa l'interfaccia: la finestra la apre il backend,
  // che scrive anche il file — compresso, con il suo manifesto (#407, D31).
  const saved = await invoke<boolean>('write_backup', {
    payload: JSON.stringify(payload),
  });
  logger.info('backup.written', {
    saved,
    tables: INSERT_ORDER.length,
    rows: Object.values(tables).reduce((total, rows) => total + rows.length, 0),
    downloadedSources: downloaded.length,
  });
  return saved;
}

/**
 * Ripristina un backup. Restituisce le opere che erano scaricate, così la
 * schermata può proporre di riprenderle: le immagini non stanno nel backup.
 */
export async function restoreBackup(t: (key: string) => string): Promise<DownloadedSource[] | null> {
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

  // Le colonne si chiedono prima di aprire la transazione: dentro si scrive e
  // basta, le letture passano da un'altra connessione.
  const columnsByTable = new Map<BackupTable, ReadonlySet<string>>();
  for (const table of INSERT_ORDER) {
    columnsByTable.set(table, await liveColumns(table));
  }

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
      const allowed = columnsByTable.get(table) ?? new Set<string>();
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
