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
