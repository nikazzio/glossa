import { invoke } from '@tauri-apps/api/core';
import type { IIIFDiscoveryOutcome, IIIFProvider } from '../types';

export async function listIIIFProviders(): Promise<IIIFProvider[]> {
  return invoke<IIIFProvider[]>('list_iiif_providers');
}

export async function discoverIIIF(providerKey: string, input: string, page = 1): Promise<IIIFDiscoveryOutcome> {
  return invoke<IIIFDiscoveryOutcome>('discover_iiif', { providerKey, input, page });
}
