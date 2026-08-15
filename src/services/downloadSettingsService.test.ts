import { describe, expect, it, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { execute, select } from './dbService';
import {
  DEFAULT_SIZE_CAP,
  DEFAULT_THUMBNAIL_EDGE,
  getGlobalSizeCap,
  getThumbnailEdge,
  getVersionSizeCap,
  listLibrarySettings,
  setGlobalSizeCap,
  setThumbnailEdge,
} from './downloadSettingsService';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn(), runInTransaction: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const selectMock = vi.mocked(select);
const executeMock = vi.mocked(execute);
const invokeMock = vi.mocked(invoke);

describe('politica di scaricamento', () => {
  beforeEach(() => {
    selectMock.mockReset();
    executeMock.mockReset().mockResolvedValue(undefined);
    invokeMock.mockReset();
  });

  it('senza niente di scelto vale il tetto predefinito', async () => {
    selectMock.mockResolvedValue([]);

    expect(await getGlobalSizeCap()).toBe(DEFAULT_SIZE_CAP);
    expect(await getThumbnailEdge()).toBe(DEFAULT_THUMBNAIL_EDGE);
  });

  it('un tetto che non è fra le scelte vale come non scritto', async () => {
    // Nel database può finirci qualunque cosa: un menu che mostra un valore
    // inesistente non è un menu.
    selectMock.mockResolvedValue([{ value: '12345' }]);

    expect(await getGlobalSizeCap()).toBe(DEFAULT_SIZE_CAP);
  });

  it('la misura più grande disponibile si salva senza correzioni', async () => {
    await setGlobalSizeCap('max');

    expect(executeMock).toHaveBeenCalledWith(expect.any(String), ['download_size_cap', 'max']);
  });

  it('una misura di miniatura fuori dalle scelte torna al predefinito', async () => {
    await setThumbnailEdge(9_000);

    expect(executeMock).toHaveBeenCalledWith(expect.any(String), [
      'thumbnail_long_edge',
      String(DEFAULT_THUMBNAIL_EDGE),
    ]);
  });

  it('un elenco di biblioteche assente non fa cadere la schermata', async () => {
    invokeMock.mockResolvedValue(null);

    expect(await listLibrarySettings()).toEqual([]);
  });

  it('il tetto della singola fonte può non esserci, ed è il caso normale', async () => {
    invokeMock.mockResolvedValue(null);

    expect(await getVersionSizeCap('sver-1')).toBeNull();
  });
});
