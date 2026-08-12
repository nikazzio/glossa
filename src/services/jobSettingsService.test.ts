import { describe, expect, it, vi, beforeEach } from 'vitest';
import { execute, select } from './dbService';
import {
  getAutoResumeDownloads,
  getJobLimits,
  limitCap,
  setAutoResumeDownloads,
  setJobLimit,
} from './jobSettingsService';

vi.mock('./dbService', () => ({ select: vi.fn(), execute: vi.fn(), runInTransaction: vi.fn() }));

const selectMock = vi.mocked(select);
const executeMock = vi.mocked(execute);

describe('limiti dei lavori', () => {
  beforeEach(() => {
    selectMock.mockReset();
    executeMock.mockReset();
    executeMock.mockResolvedValue(undefined);
  });

  it('legge i cinque limiti, uno per tipo di risorsa', async () => {
    selectMock.mockResolvedValue([{ value: '2' }]);

    const limits = await getJobLimits();

    expect(Object.keys(limits)).toEqual(['network', 'cpu', 'disk', 'languageService', 'documents']);
    expect(limits.disk).toBe(2);
  });

  it('un limite mai impostato vale automatico', async () => {
    selectMock.mockResolvedValue([]);

    const limits = await getJobLimits();

    expect(limits.cpu).toBe(0);
  });

  it('un valore illeggibile non diventa un numero a caso', async () => {
    selectMock.mockResolvedValue([{ value: 'boh' }]);

    const limits = await getJobLimits();

    expect(limits.network).toBe(0);
  });

  it('la rete ha un tetto più basso delle altre risorse', () => {
    // Non per limitare l'utente: per non farlo bandire dalla biblioteca (D11).
    expect(limitCap('network')).toBeLessThan(limitCap('cpu'));
  });

  it('un limite di rete troppo alto viene riportato al tetto', async () => {
    const saved = await setJobLimit('network', 99);

    expect(saved).toBe(limitCap('network'));
    expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('app_settings'), [
      'jobs_limit_network',
      String(limitCap('network')),
    ]);
  });

  it('un limite negativo diventa automatico invece che assurdo', async () => {
    const saved = await setJobLimit('cpu', -3);

    expect(saved).toBe(0);
  });
});

describe('ripresa automatica degli scaricamenti', () => {
  beforeEach(() => {
    selectMock.mockReset();
    executeMock.mockReset();
    executeMock.mockResolvedValue(undefined);
  });

  it('è spenta quando non è mai stata toccata', async () => {
    selectMock.mockResolvedValue([]);

    expect(await getAutoResumeDownloads()).toBe(false);
  });

  it('è accesa solo con il valore esplicito', async () => {
    selectMock.mockResolvedValue([{ value: '1' }]);

    expect(await getAutoResumeDownloads()).toBe(true);
  });

  it('salva lo stato come 1 o 0', async () => {
    await setAutoResumeDownloads(true);
    await setAutoResumeDownloads(false);

    expect(executeMock).toHaveBeenNthCalledWith(1, expect.any(String), ['auto_resume_downloads', '1']);
    expect(executeMock).toHaveBeenNthCalledWith(2, expect.any(String), ['auto_resume_downloads', '0']);
  });
});
