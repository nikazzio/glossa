import { beforeEach, describe, expect, it, vi } from 'vitest';
import { select } from './dbService';
import { libraryInventory } from './inventoryService';
import { missingAfterRestore } from './restoreFollowUp';
import type { DownloadedSource } from '../schemas/externalData';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn() }));
vi.mock('./inventoryService', () => ({ libraryInventory: vi.fn() }));
vi.mock('./jobsService', () => ({ enqueueSourceDownload: vi.fn() }));

const selectMock = vi.mocked(select);
const inventoryMock = vi.mocked(libraryInventory);

/** L'opera nel database: 328 pagine dichiarate dalla biblioteca. */
function versionRow() {
  return {
    versionId: 'v1',
    title: 'Beatus',
    providerKey: 'archive_org',
    manifestUrl: 'https://archive.test/m.json',
    expected: 328,
  };
}

/** Cosa c'è nel deposito adesso. */
function inventory(sizes: { sizeTag: string; pages: number }[]) {
  return [
    {
      versionId: 'v1',
      providerKey: 'archive_org',
      principal: sizes[0]?.sizeTag ?? null,
      hasManifest: true,
      sizes: sizes.map((size) => ({ ...size, bytes: 1_000, missing: 0 })),
    },
  ];
}

/** Cosa dichiarava il backup: completo a 2000, più tre a piena risoluzione. */
const backup: DownloadedSource[] = [
  {
    versionId: 'v1',
    sourceTitle: 'Beatus',
    providerKey: 'archive_org',
    manifestUrl: 'https://archive.test/m.json',
    principalSize: '2000',
    sizes: [
      { sizeTag: '2000', pages: 328 },
      { sizeTag: 'max', pages: 3 },
    ],
  },
];

describe('cosa manca dopo un ripristino', () => {
  beforeEach(() => {
    selectMock.mockReset();
    inventoryMock.mockReset();
    selectMock.mockResolvedValue([versionRow()]);
  });

  it('tutto al suo posto non è niente da fare', async () => {
    inventoryMock.mockResolvedValue(
      inventory([
        { sizeTag: '2000', pages: 328 },
        { sizeTag: 'max', pages: 3 },
      ]) as never,
    );

    const gap = await missingAfterRestore(backup);

    expect(gap.works).toEqual([]);
    expect(gap.unrestorable).toEqual([]);
  });

  it('un libro incompleto alla misura principale si riscarica a quella misura', async () => {
    inventoryMock.mockResolvedValue(
      inventory([
        { sizeTag: '2000', pages: 300 },
        { sizeTag: 'max', pages: 3 },
      ]) as never,
    );

    const gap = await missingAfterRestore(backup);

    expect(gap.works).toEqual([
      expect.objectContaining({ versionId: 'v1', sizeTag: '2000', present: 300, expected: 328 }),
    ]);
    expect(gap.unrestorable).toEqual([]);
  });

  it('le pagine prese a un altra misura si dicono, non si riscaricano', async () => {
    // Un lavoro di scaricamento a `max` prenderebbe tutte le 328 pagine a piena
    // risoluzione invece delle tre che l'utente aveva scelto.
    inventoryMock.mockResolvedValue(inventory([{ sizeTag: '2000', pages: 328 }]) as never);

    const gap = await missingAfterRestore(backup);

    expect(gap.works).toEqual([]);
    expect(gap.unrestorable).toEqual([{ title: 'Beatus', sizeTag: 'max', pages: 3 }]);
  });

  it('la misura principale è quella del backup, non quella più fornita adesso', async () => {
    // Ripristino a metà: della cartella a 2000 sono tornate due pagine, di
    // quella a piena risoluzione tre. Guardare quale ne ha più adesso
    // dichiarerebbe `max` come misura del libro e lo riscaricherebbe tutto lì.
    inventoryMock.mockResolvedValue(
      inventory([
        { sizeTag: 'max', pages: 3 },
        { sizeTag: '2000', pages: 2 },
      ]) as never,
    );

    const gap = await missingAfterRestore(backup);

    expect(gap.works).toEqual([
      expect.objectContaining({ sizeTag: '2000', present: 2, expected: 328 }),
    ]);
    expect(gap.unrestorable).toEqual([]);
  });

  it('senza niente nel backup non si guarda nemmeno il deposito', async () => {
    const gap = await missingAfterRestore([]);

    expect(gap).toEqual({ works: [], unrestorable: [] });
    expect(inventoryMock).not.toHaveBeenCalled();
  });
});
