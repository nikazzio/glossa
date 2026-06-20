import { invoke } from '@tauri-apps/api/core';
import type { CustomProviderProfile } from '../types';

export async function listCustomProviderProfiles(): Promise<CustomProviderProfile[]> {
  return invoke<CustomProviderProfile[]>('list_custom_provider_profiles');
}

export async function saveCustomProviderProfile(
  id: string,
  name: string,
  baseUrl: string,
  apiKey: string | null,
  requiresApiKey: boolean
): Promise<void> {
  return invoke('save_custom_provider_profile', {
    id,
    name,
    baseUrl,
    apiKey,
    requiresApiKey,
  });
}

export async function deleteCustomProviderProfile(id: string): Promise<void> {
  return invoke('delete_custom_provider_profile', { id });
}

export async function testCustomProviderConnection(
  id: string,
  model: string
): Promise<boolean> {
  return invoke<boolean>('test_custom_provider_connection', { id, model });
}
