import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { confirmReread } from './confirmReread';
import { countModelNotes } from '../../services/transcriptionNotesService';
import { hasAutomaticReading } from '../../services/transcriptionSummaryService';
import { confirm } from '../../stores/confirmStore';

vi.mock('../../services/transcriptionNotesService', () => ({ countModelNotes: vi.fn() }));
vi.mock('../../services/transcriptionSummaryService', () => ({ hasAutomaticReading: vi.fn() }));
vi.mock('../../stores/confirmStore', () => ({ confirm: vi.fn() }));

const t = ((key: string, options?: { count?: number }) =>
  options?.count !== undefined ? `${key}:${options.count}` : key) as unknown as TFunction;

beforeEach(() => vi.clearAllMocks());

describe('conferma prima di rileggere una pagina', () => {
  it('la prima lettura parte senza conferma', async () => {
    vi.mocked(hasAutomaticReading).mockResolvedValue(false);
    await expect(confirmReread('s1', t)).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('una pagina già letta chiede conferma dicendo quante note del modello cambiano', async () => {
    vi.mocked(hasAutomaticReading).mockResolvedValue(true);
    vi.mocked(countModelNotes).mockResolvedValue(5);
    vi.mocked(confirm).mockResolvedValue(true);
    await expect(confirmReread('s1', t)).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'transcription.reread.messageNotes:5' }));
  });

  it('annullando la conferma la lettura non parte', async () => {
    vi.mocked(hasAutomaticReading).mockResolvedValue(true);
    vi.mocked(countModelNotes).mockResolvedValue(0);
    vi.mocked(confirm).mockResolvedValue(false);
    await expect(confirmReread('s1', t)).resolves.toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: 'transcription.reread.message' }));
  });
});
