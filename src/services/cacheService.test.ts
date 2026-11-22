import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { cachedImage, type CacheRequest } from './cacheService';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const THUMBNAIL: CacheRequest = {
  kind: 'page', versionId: 'v1', index: 3, size: 'thumb',
  remoteUrl: 'https://gallica.bnf.fr/ark:/12148/bpt6k1/f3.thumbnail', providerKey: 'gallica',
};

describe('cachedImage', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it('serves an image already on the computer without queueing for the network', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'local_cached_image') return new Uint8Array([7, 7]).buffer;
      throw new Error(`unexpected ${command}`);
    });

    const bytes = await cachedImage(THUMBNAIL, { priority: 'low' });

    expect(Array.from(bytes)).toEqual([7, 7]);
    expect(invoke).not.toHaveBeenCalledWith('cached_image', expect.anything());
  });

  it('goes through the network queue when the image is not on the computer', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'local_cached_image') throw 'not_local';
      return new Uint8Array([1]).buffer;
    });

    const bytes = await cachedImage({ ...THUMBNAIL, index: 4 }, { priority: 'low' });

    expect(Array.from(bytes)).toEqual([1]);
    expect(invoke).toHaveBeenCalledWith('cached_image', { request: { ...THUMBNAIL, index: 4 } });
  });

  it('reads an image once from the computer when two views ask for it together', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'local_cached_image') return new Uint8Array([5]).buffer;
      throw new Error(`unexpected ${command}`);
    });
    const request = { ...THUMBNAIL, index: 5 };

    const [first, second] = await Promise.all([cachedImage(request), cachedImage(request)]);

    expect(Array.from(first)).toEqual([5]);
    expect(Array.from(second)).toEqual([5]);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'local_cached_image')).toHaveLength(1);
  });
});
