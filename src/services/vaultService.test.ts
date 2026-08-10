import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { select } from './dbService';
import {
  checkVaultFolder,
  expectedVersionPaths,
  freeVersionPages,
  getConfiguredVaultRoot,
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

  it('tratta l’impostazione vuota come "dentro la cartella dati"', async () => {
    settingReturns('');
    expect(await getConfiguredVaultRoot()).toBeNull();
  });

  it('ignora un’impostazione fatta di soli spazi', async () => {
    settingReturns('   ');
    expect(await getConfiguredVaultRoot()).toBeNull();
  });

  it('restituisce la radice scelta quando c’è', async () => {
    settingReturns('/mnt/manoscritti');
    expect(await getConfiguredVaultRoot()).toBe('/mnt/manoscritti');
  });

  it('passa la radice configurata al backend', async () => {
    settingReturns('/mnt/manoscritti');
    invokeMock.mockResolvedValueOnce({ path: '/mnt/manoscritti', reachable: true, isDefault: false });

    await getVaultStatus();

    expect(invokeMock).toHaveBeenCalledWith('get_vault_status', { configuredRoot: '/mnt/manoscritti' });
  });
});

describe('scelta di una cartella', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    selectMock.mockReset();
  });

  it('riporta il tipo di cartella senza modificarla', async () => {
    invokeMock.mockResolvedValueOnce({ kind: 'foreign', writable: true });

    const check = await checkVaultFolder('/home/niki');

    expect(check.kind).toBe('foreign');
    expect(invokeMock).toHaveBeenCalledWith('check_vault_folder', { path: '/home/niki' });
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
    invokeMock.mockResolvedValueOnce({ deletedFiles: 210, freedBytes: 3_400_000_000 });

    const freed = await freeVersionPages('gallica', 'v1');

    expect(freed.deletedFiles).toBe(210);
    expect(freed.freedBytes).toBe(3_400_000_000);
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
