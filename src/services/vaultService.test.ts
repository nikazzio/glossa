import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { select } from './dbService';
import {
  freeVersionPages,
  getSourceReadMode,
  getVaultStatus,
  summarizeAvailability,
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
  it('una fonte senza pagine in locale è solo online', () => {
    expect(summarizeAvailability(0, 210).availability).toBe('catalogued');
  });

  it('alcune pagine su molte sono uno stato parziale, non un errore', () => {
    const summary = summarizeAvailability(12, 210);
    expect(summary.availability).toBe('partial');
    expect(summary.presentPages).toBe(12);
    expect(summary.expectedPages).toBe(210);
  });

  it('tutte le pagine presenti significano completa', () => {
    expect(summarizeAvailability(210, 210).availability).toBe('complete');
  });

  it('più file del previsto contano comunque come completa', () => {
    // Succede quando alcune pagine esistono anche a piena risoluzione.
    expect(summarizeAvailability(240, 210).availability).toBe('complete');
  });

  it('senza un totale dichiarato non si inventa una percentuale', () => {
    // expected_asset_count nullo significa "non lo sappiamo ancora".
    expect(summarizeAvailability(5, 0).availability).toBe('catalogued');
  });

  it('le pagine che la biblioteca non serve non rendono il libro incompleto', () => {
    // 308 pagine sul disco su 328 dichiarate, e le venti che mancano il server
    // non le ha mai servite: riscaricarle non le farebbe comparire, quindi il
    // libro è completo per quanto la biblioteca serve.
    const summary = summarizeAvailability(308, 328, 20);
    expect(summary.availability).toBe('complete');
    // Il conteggio mostrato resta quello vero: 308, non 328.
    expect(summary.presentPages).toBe(308);
  });

  it('una pagina che manca davvero tiene il libro parziale', () => {
    // Diciannove non servite su venti mancanti: la ventesima è nostra, e va
    // ancora scaricata.
    expect(summarizeAvailability(308, 328, 19).availability).toBe('partial');
  });

  it('senza pagine rifiutate il conto è quello di prima', () => {
    expect(summarizeAvailability(308, 328).availability).toBe('partial');
  });
});
