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

/**
 * La versione del contenuto del backup.
 *
 * Si alza quando cambia **cosa** c'è dentro, non quando cambia una colonna: un
 * ripristino rifiuta i backup che dichiarano più di questo numero, ed è l'unico
 * modo che una versione vecchia ha di non aprire un file che non capisce.
 * Alzata a 2 con le dodici tabelle del blocco 1.
 */
const SCHEMA_VERSION = 2;

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
 * Si usa la forma tabellare (`pragma_table_info`) e non `PRAGMA table_info`:
 * così il nome della tabella è un parametro invece che testo dentro la query,
 * e torna una colonna sola, di tipo dichiarato. Le righe di `PRAGMA` hanno
 * colonne senza tipo, che il ponte verso il database non è tenuto a convertire.
 * I nomi restano comunque filtrati: finiscono dentro l'inserimento.
 */
async function liveColumns(table: BackupTable): Promise<ReadonlySet<string>> {
  const rows = await select<{ name: string }>(`SELECT name FROM pragma_table_info($1)`, [table]);
  const names = rows.map((row) => row.name).filter((name) => SAFE_COL.test(name));
  // Nessuna colonna vuol dire che la tabella non c'è: proseguire la
  // scarterebbe tutta senza dire niente. Si smette **prima** di cancellare.
  if (names.length === 0) throw new Error('backup_schema_unreadable');
  return new Set(names);
}

/**
 * Colonne che puntano a righe che il backup **non porta con sé**: il lavoro che
 * ha prodotto un fatto.
 *
 * Vanno svuotate al ripristino, altrimenti la chiave esterna rifiuta la riga e
 * **l'intero ripristino si ferma**: `INSERT OR IGNORE` non salva dai vincoli di
 * chiave esterna — la risoluzione dei conflitti vale per unicità, non nullo e
 * controlli, non per le chiavi esterne. Senza questo, un registro con dentro un
 * lavoro che nel backup non c'è farebbe fallire tutto.
 */
const DANGLING_REFS: Partial<Record<BackupTable, readonly string[]>> = {
  provenance_events: ['job_id'],
};

/**
 * Colonne che puntano a righe inserite **più tardi**, o che possono non esserci.
 *
 * Un frammento dice quale revisione è approvata, ma le revisioni si inseriscono
 * dopo di lui; un segmento di trascrizione dice anche a quale pagina appartiene,
 * e quella pagina può non essere su questo computer. In tutti e tre i casi
 * lasciare il puntatore com'è **ferma il ripristino**.
 *
 * Quindi si inserisce vuoto e si riscrive alla fine, ma solo dove la riga
 * puntata esiste davvero: così l'approvazione non si perde — prima spariva,
 * lasciando frammenti bloccati e senza revisione approvata, due indicazioni
 * dello stesso fatto che si contraddicono.
 */
const DEFERRED_REFS: Partial<
  Record<BackupTable, ReadonlyArray<{ column: string; target: string }>>
> = {
  translations: [{ column: 'approved_revision_id', target: 'translation_revisions' }],
  transcription_segments: [
    { column: 'approved_revision_id', target: 'transcription_revisions' },
    { column: 'asset_id', target: 'assets' },
  ],
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
  'workspace_items',
  'glossary_entry_overrides',
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
    // Le pagine sul disco si mettono da parte **prima** di cancellare.
    //
    // Le righe delle pagine sono appese alle opere, e sostituire le opere se le
    // porta via: il programma smetteva di sapere di file che sul disco ci sono
    // ancora. Una copia di lavoro le tiene al riparo dalla cancellazione a
    // catena, e alla fine tornano soltanto quelle delle opere che il backup
    // contiene — le altre appartengono a qualcosa che non esiste più.
    //
    // La copia sta nella memoria della connessione, non nel database: se
    // qualcosa va storto a metà, non resta niente da pulire.
    await run(`DROP TABLE IF EXISTS temp.kept_assets`);
    await run(`CREATE TEMP TABLE kept_assets AS SELECT * FROM assets`);

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
        const deferred = DEFERRED_REFS[table] ?? [];
        const emptied = (column: string) =>
          dangling.includes(column) || deferred.some((ref) => ref.column === column);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        await run(
          `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
          cols.map((c) => (emptied(c) ? null : row[c])),
        );
      }
    }

    // Le pagine tornano al loro posto, ma solo quelle di un'opera che esiste
    // ancora. Prima le pagine e poi le miniature: una miniatura dichiara da
    // quale pagina è nata, e una riga che punta a una che non c'è ancora
    // verrebbe scartata senza dire niente.
    const keptFor = `SELECT * FROM temp.kept_assets
                      WHERE source_version_id IN (SELECT id FROM source_versions)`;
    await run(`INSERT OR IGNORE INTO assets ${keptFor} AND derived_from_asset_id IS NULL`);
    await run(
      `INSERT OR IGNORE INTO assets ${keptFor} AND derived_from_asset_id IN (SELECT id FROM assets)`,
    );
    await run(`DROP TABLE temp.kept_assets`);

    // I puntatori lasciati vuoti tornano al loro posto, ora che le righe a cui
    // puntano ci sono. Quelle che non ci sono restano vuote: è il caso del
    // backup che arriva da un altro computer, dove le pagine non sono mai state.
    for (const table of INSERT_ORDER) {
      for (const { column, target } of DEFERRED_REFS[table] ?? []) {
        for (const row of payload.tables[table] ?? []) {
          const value = row[column];
          if (typeof value !== 'string' || !value) continue;
          await run(
            `UPDATE ${table} SET ${column} = $1
              WHERE id = $2 AND EXISTS (SELECT 1 FROM ${target} WHERE id = $1)`,
            [value, row.id],
          );
        }
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
