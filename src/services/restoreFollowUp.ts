import { execute, select } from './dbService';
import { libraryInventory } from './inventoryService';
import { enqueueSourceDownload } from './jobsService';
import { logger } from '../utils/logger';
import { downloadedSourcesSchema, type DownloadedSource } from '../schemas/externalData';

/**
 * Cosa succede **dopo** un ripristino (#345).
 *
 * Il ripristino rimette le pagine che erano sul disco, ma non può sapere se
 * quei file ci sono davvero: il backup arriva da un'altra macchina, o il disco
 * nel frattempo è cambiato. Quindi non si fida — mette in coda il controllo
 * del deposito e aspetta il suo verdetto.
 *
 * L'attesa è scritta nel database e non tenuta a mente: il ripristino ricarica
 * l'applicazione, e un controllo su migliaia di file può finire molto dopo,
 * magari alla riapertura successiva.
 */

const PENDING_KEY = 'restore_pending_check';

export interface PendingRestoreCheck {
  /** Il controllo del deposito da aspettare. */
  jobId: string;
  /** Le opere che il backup dichiarava scaricate, con la misura che avevano. */
  downloaded: DownloadedSource[];
}

/** Un'opera a cui, dopo il controllo, mancano pagine della misura principale. */
export interface MissingWork {
  versionId: string;
  title: string;
  providerKey: string | null;
  manifestUrl: string | null;
  sizeTag: string | null;
  present: number;
  expected: number;
}

/**
 * Pagine che c'erano a una misura **diversa** dalla principale e adesso non ci
 * sono: tipicamente le tre prese a piena risoluzione per una trascrizione.
 *
 * Non si accodano: uno scaricamento del libro a quella misura scaricherebbe
 * tutte le pagine invece di quelle tre, che è l'opposto di quello che l'utente
 * aveva scelto. Si dicono, e chi le vuole se le riprende una per una.
 */
export interface UnrestorableSize {
  title: string;
  sizeTag: string;
  pages: number;
}

/** Cosa manca dopo un ripristino: quello che si riscarica, e quello che no. */
export interface RestoreGap {
  works: MissingWork[];
  unrestorable: UnrestorableSize[];
}

export async function markRestoreCheck(pending: PendingRestoreCheck): Promise<void> {
  await execute(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [PENDING_KEY, JSON.stringify(pending)],
  );
}

export async function clearRestoreCheck(): Promise<void> {
  await execute('DELETE FROM app_settings WHERE key = $1', [PENDING_KEY]);
}

/** L'attesa in corso, se c'è. Una riga storta vale come assente. */
export async function pendingRestoreCheck(): Promise<PendingRestoreCheck | null> {
  const rows = await select<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [
    PENDING_KEY,
  ]);
  if (rows.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(rows[0].value);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.jobId !== 'string' || !record.jobId) return null;
    // L'elenco arriva da un file di backup: si valida invece di fidarsi della
    // forma, e quello che non la rispetta vale come assente.
    const downloaded = downloadedSourcesSchema.safeParse(record.downloaded);
    return {
      jobId: record.jobId,
      downloaded: downloaded.success ? downloaded.data : [],
    };
  } catch {
    return null;
  }
}

/**
 * Cosa manca dopo che il controllo del deposito ha detto la sua.
 *
 * Le pagine presenti le conta il deposito adesso — il controllo ha già visto
 * cosa c'è davvero — e si confrontano con quante ne ha l'opera. La misura da
 * usare per riprenderle viene dal backup: riscaricarle a una misura diversa da
 * quella che avevano sarebbe una sorpresa.
 *
 * Le misure prese a parte si contano separatamente, perché non si riprendono con
 * un lavoro di scaricamento (`UnrestorableSize`).
 */
export async function missingAfterRestore(downloaded: DownloadedSource[]): Promise<RestoreGap> {
  const empty: RestoreGap = { works: [], unrestorable: [] };
  if (downloaded.length === 0) return empty;
  const wanted = new Map(downloaded.map((source) => [source.versionId, source]));
  const rows = await select<{
    versionId: string;
    title: string;
    providerKey: string | null;
    manifestUrl: string | null;
    expected: number;
  }>(
    `SELECT v.id                                      AS versionId,
            s.title                                   AS title,
            json_extract(v.metadata, '$.providerKey') AS providerKey,
            v.source_url                              AS manifestUrl,
            COALESCE(v.expected_asset_count, 0)       AS expected
       FROM source_versions v
       JOIN sources s ON s.id = v.source_id`,
  );
  // Quante pagine ci sono davvero lo dice il deposito: il conteggio atteso
  // resta nel database perché una cartella non sa quante dovrebbero essercene.
  const inventory = await libraryInventory();
  const present = new Map(inventory.map((entry) => [entry.versionId, entry]));

  const gap: RestoreGap = { works: [], unrestorable: [] };
  for (const row of rows) {
    const backup = wanted.get(row.versionId);
    if (!backup) continue;
    const found = present.get(row.versionId);
    const pagesAt = (sizeTag: string | null) =>
      found?.sizes.find((size) => size.sizeTag === sizeTag)?.pages ?? 0;

    // La misura principale è quella che il backup dichiarava, non quella che ha
    // più pagine adesso: dopo un ripristino a metà sarebbero due cose diverse.
    const principal = pagesAt(backup.principalSize);
    if (row.expected > 0 && principal < row.expected) {
      gap.works.push({
        versionId: row.versionId,
        title: row.title,
        providerKey: row.providerKey,
        manifestUrl: row.manifestUrl,
        sizeTag: backup.principalSize,
        present: principal,
        expected: row.expected,
      });
    }

    for (const size of backup.sizes) {
      if (size.sizeTag === backup.principalSize) continue;
      const missing = size.pages - pagesAt(size.sizeTag);
      if (missing > 0) {
        gap.unrestorable.push({
          title: row.title,
          sizeTag: size.sizeTag,
          pages: missing,
        });
      }
    }
  }
  return gap;
}

/**
 * Rimette in coda le opere incomplete. Restituisce quante non sono partite: un
 * lavoro che nessuno ha messo in coda, e nessuno ha detto, si scopre non
 * trovandolo.
 */
export async function redownload(works: MissingWork[]): Promise<number> {
  let failed = 0;
  for (const work of works) {
    if (!work.manifestUrl) {
      failed += 1;
      continue;
    }
    try {
      await enqueueSourceDownload({
        providerKey: work.providerKey ?? 'generic',
        manifestUrl: work.manifestUrl,
        versionId: work.versionId,
        sizeTag: work.sizeTag ?? undefined,
      });
    } catch (error: unknown) {
      failed += 1;
      logger.warn('restore.redownload.not_queued', {
        versionId: work.versionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failed;
}
