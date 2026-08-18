import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { select } from './dbService';
import {
  expectedVersionPaths,
  freeVersionPages,
  getSourceReadMode,
  getVaultStatus,
  summarizeAvailability,
  verifyFilesIntegrity,
  verifyFilesPresent,
} from './vaultService';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn(), runInTransaction: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const selectMock = vi.mocked(select);

function settingReturns(value: string | null) {
  selectMock.mockResolvedValue(value === null ? [] : [{ value }]);
}

describe('radice del deposito', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    selectMock.mockReset();
  });

  it('non manda nessun percorso al backend: lo legge lui', async () => {
    // Un comando che accetta un percorso dall'interfaccia farebbe guardare — e
    // cancellare — dentro cartelle che non sono il deposito (#405).
    settingReturns('/mnt/manoscritti');
    invokeMock.mockResolvedValueOnce({ path: '/mnt/manoscritti', reachable: true, isDefault: false });

    await getVaultStatus();

    expect(invokeMock).toHaveBeenCalledWith('get_vault_status');
  });
});

describe('modalità di lettura', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('è "auto" quando non è mai stata impostata', async () => {
    settingReturns(null);
    expect(await getSourceReadMode()).toBe('auto');
  });

  it('ricade su "auto" davanti a un valore non riconosciuto', async () => {
    settingReturns('qualcosa');
    expect(await getSourceReadMode()).toBe('auto');
  });

  it('rispetta i due valori espliciti', async () => {
    settingReturns('local');
    expect(await getSourceReadMode()).toBe('local');
    settingReturns('remote');
    expect(await getSourceReadMode()).toBe('remote');
  });
});

describe('verifica dei file', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    selectMock.mockReset();
    settingReturns('');
  });

  it('chiede al backend i percorsi attesi invece di costruirli qui', async () => {
    invokeMock.mockResolvedValueOnce(['providers/gallica/v1/manifest.json']);

    await expectedVersionPaths('gallica', 'v1', '2000', 3);

    expect(invokeMock).toHaveBeenCalledWith('expected_version_paths', {
      providerKey: 'gallica',
      versionId: 'v1',
      sizeTag: '2000',
      pageCount: 3,
    });
  });

  it('propaga il deposito irraggiungibile invece di dichiarare tutto mancante', async () => {
    invokeMock.mockRejectedValueOnce('vault_unreachable');

    await expect(verifyFilesPresent(['providers/gallica/v1/pages/2000/0001.jpg'])).rejects.toBe(
      'vault_unreachable',
    );
  });

  it('segna la riga storta e tiene buone le altre', async () => {
    invokeMock.mockResolvedValueOnce([
      { vaultPath: 'providers/gallica/v1/pages/2000/0001.jpg', state: 'present', detail: null },
      { vaultPath: '../fuori.jpg', state: 'invalid', detail: 'vault_path must not escape the vault root' },
      { vaultPath: 'providers/gallica/v1/pages/2000/0002.jpg', state: 'missing', detail: null },
    ]);

    const results = await verifyFilesPresent([
      'providers/gallica/v1/pages/2000/0001.jpg',
      '../fuori.jpg',
      'providers/gallica/v1/pages/2000/0002.jpg',
    ]);

    expect(results.map((row) => row.state)).toEqual(['present', 'invalid', 'missing']);
    expect(results[1].detail).toContain('escape');
  });

  it('riporta lo stato di ogni file nella verifica completa', async () => {
    invokeMock.mockResolvedValueOnce([
      { vaultPath: 'a.jpg', state: 'valid', detail: null, checksum: 'abc' },
      { vaultPath: 'b.jpg', state: 'corrupt', detail: 'JPEG troncato', checksum: null },
    ]);

    const results = await verifyFilesIntegrity(['a.jpg', 'b.jpg']);

    expect(results[0].state).toBe('valid');
    expect(results[1].detail).toContain('troncato');
  });
});

describe('libera spazio', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    selectMock.mockReset();
    settingReturns('');
  });

  it('restituisce quanto è stato liberato', async () => {
    invokeMock.mockResolvedValueOnce({
      deletedFiles: 210,
      freedBytes: 3_400_000_000,
      deleted: ['providers/gallica/v1/pages/2000/0001.jpg'],
      failed: [],
    });

    const freed = await freeVersionPages('v1', ['providers/gallica/v1/pages/2000/0001.jpg']);

    expect(freed.deletedFiles).toBe(210);
    expect(freed.freedBytes).toBe(3_400_000_000);
  });

  it('passa i percorsi delle carte, non la chiave della biblioteca', async () => {
    // Con la chiave sbagliata la cartella non esisteva, il comando dichiarava
    // zero file liberati senza errore, e le righe se ne andavano comunque: le
    // carte restavano sul disco senza più niente che le reclamasse.
    invokeMock.mockResolvedValueOnce({ deletedFiles: 1, freedBytes: 10, deleted: [], failed: [] });

    await freeVersionPages('v1', ['providers/gallica/v1/pages/2000/0001.jpg']);

    expect(invokeMock).toHaveBeenCalledWith('free_version_pages', {
      versionId: 'v1',
      vaultPaths: ['providers/gallica/v1/pages/2000/0001.jpg'],
    });
  });

  it('dice quali percorsi non è riuscita a cancellare', async () => {
    // Chi chiama deve poter tenere le righe: un file ancora sul disco senza la
    // sua riga è invisibile a ogni schermata e non ha liberato un byte.
    invokeMock.mockResolvedValueOnce({
      deletedFiles: 0,
      freedBytes: 0,
      deleted: [],
      failed: ['providers/gallica/v1/pages/2000/0001.jpg'],
    });

    const freed = await freeVersionPages('v1', ['providers/gallica/v1/pages/2000/0001.jpg']);

    expect(freed.failed).toHaveLength(1);
  });
});

describe('disponibilità', () => {
  it('una fonte senza carte in locale è solo online', () => {
    expect(summarizeAvailability(0, 210).availability).toBe('catalogued');
  });

  it('alcune carte su molte sono uno stato parziale, non un errore', () => {
    const summary = summarizeAvailability(12, 210);
    expect(summary.availability).toBe('partial');
    expect(summary.presentPages).toBe(12);
    expect(summary.expectedPages).toBe(210);
  });

  it('tutte le carte presenti significano completa', () => {
    expect(summarizeAvailability(210, 210).availability).toBe('complete');
  });

  it('più file del previsto contano comunque come completa', () => {
    // Succede quando alcune carte esistono anche a piena risoluzione.
    expect(summarizeAvailability(240, 210).availability).toBe('complete');
  });

  it('senza un totale dichiarato non si inventa una percentuale', () => {
    // expected_asset_count nullo significa "non lo sappiamo ancora".
    expect(summarizeAvailability(5, 0).availability).toBe('catalogued');
  });
});
