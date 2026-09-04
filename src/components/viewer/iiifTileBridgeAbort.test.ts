import { describe, expect, it, vi } from 'vitest';

vi.unmock('openseadragon');
vi.mock('../../services/iiifViewerService', () => ({
  fetchIiifBytes: vi.fn(),
}));

import { fetchIiifBytes } from '../../services/iiifViewerService';
import { createControlledIiifTileSource } from './iiifTileBridge';

describe('ponte tasselli IIIF', () => {
  it('scarta una risposta arrivata dopo che OpenSeadragon ha annullato la richiesta', async () => {
    let release!: (bytes: Uint8Array) => void;
    vi.mocked(fetchIiifBytes).mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const source = createControlledIiifTileSource(
      {
        '@context': 'http://iiif.io/api/image/3/context.json',
        id: 'https://images.example.test/page-1',
        width: 1000,
        height: 1400,
        profile: 'level1',
      },
      null,
    );
    const context = {
      src: 'https://images.example.test/page-1/full/500,700/0/default.jpg',
      userData: {},
      finish: vi.fn(),
      fail: vi.fn(),
    } as never;

    source.downloadTileStart(context);
    source.downloadTileAbort(context);
    release(new Uint8Array([1, 2, 3]));
    await Promise.resolve();
    await Promise.resolve();

    expect((context as { finish: ReturnType<typeof vi.fn> }).finish).not.toHaveBeenCalled();
    expect((context as { fail: ReturnType<typeof vi.fn> }).fail).not.toHaveBeenCalled();
  });
});
