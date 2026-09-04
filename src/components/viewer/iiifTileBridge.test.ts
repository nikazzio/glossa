import { describe, expect, it, vi } from 'vitest';

vi.unmock('openseadragon');

import { createControlledIiifTileSource } from './iiifTileBridge';

describe('createControlledIiifTileSource', () => {
  it.each([
    ['http://iiif.io/api/image/2/context.json', 2],
    ['http://iiif.io/api/image/3/context.json', 3],
    ['https://iiif.io/api/image/2/context.json', 2],
    ['https://iiif.io/api/image/3/context.json', 3],
  ])('normalizza i metadati Image API %s prima di creare la piramide', (context, version) => {
    const source = createControlledIiifTileSource(
      {
        '@context': context,
        id: 'https://images.example.test/iiif/page-1',
        width: 2400,
        height: 3600,
        tiles: [{ width: 512, scaleFactors: [1, 2, 4, 8] }],
        profile: version === 2 ? 'http://iiif.io/api/image/2/level2.json' : 'level2',
      },
      null,
    );

    expect((source as { version?: number }).version).toBe(version);
  });
});
