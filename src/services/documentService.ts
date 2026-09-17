import { invoke } from '@tauri-apps/api/core';

/**
 * Il documento unico offerto dalla biblioteca: un file, non una sequenza di
 * immagini. I byte passano dal motore, che è l'unico a conoscere la radice del
 * deposito; il percorso non arriva mai alla finestra.
 */

/** Oltre questa misura il documento non si apre dentro Glossa: il motore lo
 *  dichiara con `document_too_large` e resta l'apertura con il lettore del
 *  sistema. */
export const DOCUMENT_TOO_LARGE = 'document_too_large';

export async function documentBytes(providerKey: string, versionId: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>('document_bytes', { providerKey, versionId }));
}

/** Apre il documento con il lettore del sistema. */
export async function openDocumentExternally(providerKey: string, versionId: string): Promise<void> {
  await invoke('open_document_externally', { providerKey, versionId });
}

/** Vero quando il motore ha rifiutato il documento perché troppo grande per
 *  essere aperto nella finestra. */
export function isTooLarge(error: unknown): boolean {
  return String(error).includes(DOCUMENT_TOO_LARGE);
}
