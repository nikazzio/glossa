import { enqueueSourceDownload } from './jobsService';
import type { Job } from './jobsService';
import { versionProviderKey } from './libraryService';
import type { LibraryCatalogEntry } from '../types';

/**
 * La biblioteca di una copia. La chiave scritta nel deposito vince su quella
 * dei metadati: le fonti aggiunte prima che la provenienza venisse salvata
 * hanno i file sotto una chiave che solo il deposito conosce.
 */
export async function providerKeyOf(entry: LibraryCatalogEntry): Promise<string> {
  return (entry.versionId ? await versionProviderKey(entry.versionId) : null) ?? entry.providerKey ?? 'generic';
}

/** Mette in coda lo scaricamento della copia principale; niente se non ha un manifesto. */
export async function enqueueEntryDownload(entry: LibraryCatalogEntry): Promise<Job | null> {
  if (!entry.manifestUrl) return null;
  return enqueueSourceDownload({
    providerKey: await providerKeyOf(entry),
    manifestUrl: entry.manifestUrl,
    versionId: entry.versionId ?? undefined,
  });
}
