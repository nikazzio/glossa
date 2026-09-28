import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../jobsService', () => ({ enqueueSourceDownload: vi.fn() }));
vi.mock('../libraryService', () => ({ versionProviderKey: vi.fn() }));

import { enqueueSourceDownload } from '../jobsService';
import { versionProviderKey } from '../libraryService';
import { enqueueEntryDownload, providerKeyOf } from '../sourceDownload';
import type { LibraryCatalogEntry } from '../../types';

const entry = (overrides: Partial<LibraryCatalogEntry>): LibraryCatalogEntry =>
  ({ versionId: 'v1', providerKey: 'gallica', manifestUrl: 'https://example.org/manifest.json', ...overrides }) as LibraryCatalogEntry;

describe('providerKeyOf', () => {
  beforeEach(() => vi.clearAllMocks());

  it('la chiave del deposito vince su quella dei metadati', async () => {
    vi.mocked(versionProviderKey).mockResolvedValue('vatican');
    expect(await providerKeyOf(entry({}))).toBe('vatican');
  });

  it('senza chiave nel deposito si usa quella dei metadati', async () => {
    vi.mocked(versionProviderKey).mockResolvedValue(null);
    expect(await providerKeyOf(entry({}))).toBe('gallica');
  });

  it('senza copia né metadati si ripiega sulla chiave generica', async () => {
    expect(await providerKeyOf(entry({ versionId: null, providerKey: null }))).toBe('generic');
    expect(versionProviderKey).not.toHaveBeenCalled();
  });
});

describe('enqueueEntryDownload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('senza manifesto non mette in coda niente', async () => {
    expect(await enqueueEntryDownload(entry({ manifestUrl: null }))).toBeNull();
    expect(enqueueSourceDownload).not.toHaveBeenCalled();
  });

  it('mette in coda la copia con la biblioteca del deposito', async () => {
    vi.mocked(versionProviderKey).mockResolvedValue('vatican');
    vi.mocked(enqueueSourceDownload).mockResolvedValue({ id: 'download:v1' } as never);

    const job = await enqueueEntryDownload(entry({}));

    expect(job).toEqual({ id: 'download:v1' });
    expect(enqueueSourceDownload).toHaveBeenCalledWith({
      providerKey: 'vatican',
      manifestUrl: 'https://example.org/manifest.json',
      versionId: 'v1',
    });
  });
});
