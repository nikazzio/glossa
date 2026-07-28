import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listIIIFProviders } from './iiifProviderService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('listIIIFProviders', () => {
  it('reads provider capabilities from the native registry', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);

    await expect(listIIIFProviders()).resolves.toEqual([]);

    expect(invoke).toHaveBeenCalledWith('list_iiif_providers');
  });
});
