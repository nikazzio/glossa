import { invoke } from '@tauri-apps/api/core';
import type { IIIFProvider } from '../types';

export async function listIIIFProviders(): Promise<IIIFProvider[]> {
  return invoke<IIIFProvider[]>('list_iiif_providers');
}
