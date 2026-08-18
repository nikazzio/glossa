import { execute, select } from './dbService';
import { enqueueSourceDownload } from './jobsService';
import { versionProviderKey } from './libraryService';
import { logger } from '../utils/logger';
import type { DownloadedSource } from '../schemas/externalData';

/**
 * Cosa succede **dopo** un ripristino (#345, D31, D5-bis).
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

/** Un'opera a cui, dopo il controllo, mancano delle pagine. */
export interface MissingWork {
  versionId: string;
  title: string;
  providerKey: string | null;
  manifestUrl: string | null;
  sizeTag: string | null;
  present: number;
  expected: number;
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
    return {
      jobId: record.jobId,
      downloaded: Array.isArray(record.downloaded) ? (record.downloaded as DownloadedSource[]) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Le opere a cui mancano pagine, dopo che il controllo ha detto la sua.
 *
 * Si contano le pagine che il database dichiara adesso — il controllo ha già
 * tolto quelle i cui file non c'erano più — e si confrontano con quante ne ha
 * l'opera. La misura da usare per riprenderle viene dal backup: riscaricarle a
 * una misura diversa da quella che avevano sarebbe una sorpresa.
 */
export async function missingAfterRestore(downloaded: DownloadedSource[]): Promise<MissingWork[]> {
  if (downloaded.length === 0) return [];
  const wanted = new Map(downloaded.map((source) => [source.versionId, source]));
  const rows = await select<{
    versionId: string;
    title: string;
    providerKey: string | null;
    manifestUrl: string | null;
    expected: number;
    present: number;
  }>(
    `SELECT v.id                                      AS versionId,
            s.title                                   AS title,
            json_extract(v.metadata, '$.providerKey') AS providerKey,
            v.source_url                              AS manifestUrl,
            COALESCE(v.expected_asset_count, 0)       AS expected,
            COUNT(DISTINCT a.page_index)              AS present
       FROM source_versions v
       JOIN sources s ON s.id = v.source_id
       LEFT JOIN assets a
         ON a.source_version_id = v.id AND a.kind = 'image' AND a.locality = 'local'
      GROUP BY v.id`,
  );

  return rows
    .filter((row) => wanted.has(row.versionId) && row.expected > 0 && row.present < row.expected)
    .map((row) => ({
      versionId: row.versionId,
      title: row.title,
      providerKey: row.providerKey,
      manifestUrl: row.manifestUrl,
      sizeTag: wanted.get(row.versionId)?.sizeTag ?? null,
      present: row.present,
      expected: row.expected,
    }));
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
        // La chiave **come è scritta nel deposito** prima di quella dei
        // metadati: sono le carte già sul disco a dire dove va il resto. Con
        // `generic` come primo ripiego la stessa opera finiva in una cartella
        // nuova, e le carte già scaricate non venivano ritrovate — nel deposito
        // di prova sono nate così le cartelle sotto `generic` e `unknown`.
        providerKey:
          (await versionProviderKey(work.versionId)) ?? work.providerKey ?? 'generic',
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
