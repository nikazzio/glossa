import { execute, select } from './dbService';
import { logger } from '../utils/logger';

/**
 * Le pagine tolte dal computer **di proposito**.
 *
 * Senza questa memoria l'eliminazione non dura: il primo scaricamento del libro
 * rimetterebbe al suo posto la carta bianca appena buttata. L'esclusione vale
 * per la copia digitale e non per una singola misura — una pagina che non
 * interessa non interessa a nessuna risoluzione — e si scioglie quando è
 * l'utente stesso a richiedere quella pagina.
 */
export async function excludedPages(versionId: string): Promise<Set<number>> {
  const rows = await select<{ page_index: number }>(
    'SELECT page_index FROM excluded_pages WHERE version_id = $1',
    [versionId],
  );
  return new Set(rows.map((row) => row.page_index));
}

export async function excludePage(versionId: string, pageIndex: number): Promise<void> {
  await execute(
    `INSERT INTO excluded_pages (version_id, page_index) VALUES ($1, $2)
     ON CONFLICT(version_id, page_index) DO NOTHING`,
    [versionId, pageIndex],
  );
  logger.info('library.page.excluded', { versionId, pageIndex });
}

/** Richiedere una pagina esclusa la riammette: altrimenti il comando per
 *  riprenderla non avrebbe effetto e sembrerebbe rotto. */
export async function includePage(versionId: string, pageIndex: number): Promise<void> {
  await execute('DELETE FROM excluded_pages WHERE version_id = $1 AND page_index = $2', [
    versionId,
    pageIndex,
  ]);
  logger.info('library.page.included', { versionId, pageIndex });
}
