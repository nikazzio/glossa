import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { discoverIIIF, listIIIFProviders } from './iiifProviderService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('listIIIFProviders', () => {
  it('reads provider capabilities from the native registry', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);

    await expect(listIIIFProviders()).resolves.toEqual([]);

    expect(invoke).toHaveBeenCalledWith('list_iiif_providers');
  });
});

describe('discoverIIIF', () => {
  it('sends selected collection and input to the native discovery command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ status: 'not_found', providerKey: 'generic', manifest: null, results: [], hasMore: false });

    await discoverIIIF('generic', 'https://example.org/manifest.json', 2);

    expect(invoke).toHaveBeenCalledWith('discover_iiif', {
      providerKey: 'generic',
      input: 'https://example.org/manifest.json',
      page: 2,
      fresh: false,
    });
  });

  it('chiede alla biblioteca invece di rispondere con quello che ha, quando glielo si dice', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ status: 'not_found', providerKey: 'generic', manifest: null, results: [], hasMore: false });

    await discoverIIIF('gallica', 'heures', 1, true);

    expect(invoke).toHaveBeenCalledWith('discover_iiif', {
      providerKey: 'gallica',
      input: 'heures',
      page: 1,
      fresh: true,
    });
  });
});
