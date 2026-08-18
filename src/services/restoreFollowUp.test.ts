import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redownload } from './restoreFollowUp';
import { enqueueSourceDownload } from './jobsService';
import { versionProviderKey } from './libraryService';

vi.mock('./dbService', () => ({
  execute: vi.fn().mockResolvedValue(undefined),
  select: vi.fn().mockResolvedValue([]),
}));

vi.mock('./jobsService', () => ({
  enqueueSourceDownload: vi.fn().mockResolvedValue({ id: 'download:v1' }),
}));

vi.mock('./libraryService', () => ({
  versionProviderKey: vi.fn().mockResolvedValue(null),
}));

const work = (overrides = {}) => ({
  versionId: 'v1',
  title: 'Opera di prova',
  providerKey: null,
  manifestUrl: 'https://iiif.archive.org/iiif/opera/manifest.json',
  sizeTag: '2000',
  present: 10,
  expected: 328,
  ...overrides,
});

describe('riscaricamento dopo un ripristino', () => {
  beforeEach(() => {
    vi.mocked(enqueueSourceDownload).mockClear();
    vi.mocked(versionProviderKey).mockReset();
    vi.mocked(versionProviderKey).mockResolvedValue(null);
  });

  it('usa la chiave con cui le carte stanno già nel deposito', async () => {
    // È il caso che contava: i metadati possono non avere la chiave, e con
    // `generic` come ripiego la stessa opera finiva in una cartella nuova. Le
    // carte già scaricate non venivano ritrovate e si riscaricava tutto.
    vi.mocked(versionProviderKey).mockResolvedValue('archive_org');

    const failed = await redownload([work()]);

    expect(failed).toBe(0);
    expect(enqueueSourceDownload).toHaveBeenCalledWith(
      expect.objectContaining({ providerKey: 'archive_org', versionId: 'v1' }),
    );
  });

  it('senza carte nel deposito vale la chiave dei metadati', async () => {
    await redownload([work({ providerKey: 'gallica' })]);

    expect(enqueueSourceDownload).toHaveBeenCalledWith(
      expect.objectContaining({ providerKey: 'gallica' }),
    );
  });

  it('senza né carte né metadati resta il ripiego', async () => {
    await redownload([work()]);

    expect(enqueueSourceDownload).toHaveBeenCalledWith(
      expect.objectContaining({ providerKey: 'generic' }),
    );
  });

  it('un opera senza manifesto non parte e si conta', async () => {
    // Un lavoro che nessuno ha messo in coda, e nessuno ha detto, si scopre non
    // trovandolo.
    const failed = await redownload([work({ manifestUrl: null })]);

    expect(failed).toBe(1);
    expect(enqueueSourceDownload).not.toHaveBeenCalled();
  });
});
