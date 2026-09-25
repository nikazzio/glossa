import { describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listIIIFProviders, openWork, recognizeWork } from './iiifProviderService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('listIIIFProviders', () => {
  it('reads provider capabilities from the native registry', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]);

    await expect(listIIIFProviders()).resolves.toEqual([]);

    expect(invoke).toHaveBeenCalledWith('list_iiif_providers');
  });
});

describe('recognizeWork e openWork', () => {
  it('chiede al motore chi riconosce quello che è stato scritto', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ providerKey: 'gallica', docId: 'bpt6k3282120' }]);

    await expect(recognizeWork('bpt6k3282120')).resolves.toEqual([{ providerKey: 'gallica', docId: 'bpt6k3282120' }]);

    expect(invoke).toHaveBeenCalledWith('recognize_work', { input: 'bpt6k3282120' });
  });

  it('apre l\'opera dalla biblioteca che la riconosce', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ manifestUrl: 'https://example.org/manifest.json' });

    await openWork('gallica', 'bpt6k3282120');

    expect(invoke).toHaveBeenCalledWith('open_work', { providerKey: 'gallica', input: 'bpt6k3282120' });
  });
});
