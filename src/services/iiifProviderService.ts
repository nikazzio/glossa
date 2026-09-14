import { invoke } from '@tauri-apps/api/core';
import type { IIIFDiscoveryOutcome, IIIFProvider } from '../types';

export async function listIIIFProviders(): Promise<IIIFProvider[]> {
  return invoke<IIIFProvider[]>('list_iiif_providers');
}

/**
 * `fresh` salta il risultato conservato e ripassa dalla biblioteca: è l'unico
 * modo di sapere se il catalogo è cresciuto prima che quello conservato scada.
 */
export async function discoverIIIF(
  providerKey: string,
  input: string,
  page = 1,
  fresh = false,
): Promise<IIIFDiscoveryOutcome> {
  return invoke<IIIFDiscoveryOutcome>('discover_iiif', { providerKey, input, page, fresh });
}

/**
 * Se un risultato si apre davvero.
 *
 * `null` vuol dire «non si sa»: il servizio non ha risposto, o ha risposto in
 * un modo che non dice niente sull'opera. Solo `false` significa che la
 * biblioteca dichiara di non avere quel libro.
 */
export async function probeManifest(
  providerKey: string,
  manifestUrl: string,
): Promise<boolean | null> {
  return invoke<boolean | null>('probe_manifest', { providerKey, manifestUrl });
}

/**
 * Il manifesto così come la biblioteca lo pubblica.
 *
 * È la sua dichiarazione sull'opera — pagine, misure, diritti, provenienza — e
 * nei dati tecnici della scheda si legge per intero invece di ricostruirla da
 * quello che il visore ne mostra.
 */
export async function readManifestText(
  providerKey: string,
  manifestUrl: string,
): Promise<string> {
  return invoke<string>('read_iiif_manifest_text', { providerKey, manifestUrl });
}
