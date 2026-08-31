/**
 * Il backup del programma intero (#345, #407).
 *
 * **Non è di un workspace**: prende tutte le tabelle e al ripristino le
 * sostituisce tutte. Il file serve a rimettere in piedi Glossa dov'era, non a
 * spostare un lavoro da una macchina all'altra — quello sarà l'esportazione di
 * un workspace, che ha bisogno di identificatori nuovi e delle regole di ambito.
 */
import { invoke } from '@tauri-apps/api/core';
import { libraryInventory } from './inventoryService';
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
 * Alzata a 3 con le pagine logiche delle fonti.
 */
const SCHEMA_VERSION = 3;

export type BackupOptions =
  | { privacy: 'glossaOnly' }
  | { privacy: 'password'; password: string; recoveryCode: string };

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
 * dopo di lui; un segmento di trascrizione dice anche a quale pagina logica appartiene,
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
    { column: 'source_page_id', target: 'source_pages' },
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
  'source_pages',
  'library_network_profiles',
  'network_profiles',
  'workspace_items',
  'glossary_entry_overrides',
  'library_saved_views',
  'source_collection_items',
  'source_collections',
  'source_field_overrides',
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
 * Le opere che erano scaricate, con la misura usata.
 *
 * È ciò che rende indolore l'esclusione delle immagini: al ripristino Glossa
 * può proporre «riscarico le dodici opere che avevi?». Si guardano le righe
 * delle pagine, non i file: dopo il ripristino i file non ci sono comunque.
 */
async function downloadedSources(): Promise<DownloadedSource[]> {
  // Cosa c'è scaricato lo dice il **deposito**, non le righe: le pagine non ne
  // hanno più una a testa. Dal database restano solo titolo e indirizzo
  // del manifesto, che non si ricavano da una cartella.
  const inventory = await libraryInventory();
  if (inventory.length === 0) return [];
  const rows = await select<{ versionId: string; sourceTitle: string; manifestUrl: string | null }>(
    `SELECT v.id AS versionId, s.title AS sourceTitle, v.source_url AS manifestUrl
       FROM source_versions v
       JOIN sources s ON s.id = v.source_id
      ORDER BY s.title`,
  );
  const byVersion = new Map(rows.map((row) => [row.versionId, row]));

  return inventory
    .filter((entry) => entry.principal !== null && byVersion.has(entry.versionId))
    .map((entry) => {
      const row = byVersion.get(entry.versionId);
      return {
        versionId: entry.versionId,
        sourceTitle: row?.sourceTitle ?? entry.versionId,
        providerKey: entry.providerKey,
        manifestUrl: row?.manifestUrl ?? null,
        // La misura con cui il libro è stato scaricato: è quella che il
        // ripristino deve richiedere.
        principalSize: entry.principal,
        // **Tutte** le misure che c'erano, non solo la principale: le pagine
        // prese a piena risoluzione di proposito sono le più costose da
        // riottenere, ed erano quelle che il backup dimenticava.
        sizes: entry.sizes
          .filter((size) => size.pages > 0)
          .map((size) => ({ sizeTag: size.sizeTag, pages: size.pages })),
      };
    });
}

/**
 * Scrive il backup. Restituisce `false` se la finestra di salvataggio è stata
 * chiusa senza scegliere: annullare non è un errore, ma nemmeno un successo da
 * annunciare.
 */
export async function writeBackup(options: BackupOptions = { privacy: 'glossaOnly' }): Promise<boolean> {
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
  // che scrive anche il file — compresso, con il suo manifesto (#407).
  const saved = await invoke<boolean>('write_backup', {
    payload: JSON.stringify(payload),
    options,
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
export async function restoreBackup(
  t: (key: string) => string,
  secret?: string,
): Promise<DownloadedSource[] | null> {
  // La finestra e la lettura stanno nel backend (#407): una webview
  // compromessa non può farsi leggere un file a sua scelta.
  // Password e codice di recupero sbloccano lo stesso archivio. Il backend
  // prova entrambe le derivazioni senza dover sapere quale dei due è stato
  // digitato, quindi non si rivela quale chiave l'utente conserva.
  const raw = await invoke<string | null>('read_backup', { password: secret || null });
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
