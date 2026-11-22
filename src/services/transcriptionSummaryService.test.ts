import { beforeEach, describe, expect, it, vi } from 'vitest';
import { select } from './dbService';
import { getTranscriptionSummary } from './transcriptionSummaryService';

vi.mock('./dbService', () => ({ select: vi.fn() }));

const selectMock = vi.mocked(select);

const outcome = (overrides: Record<string, unknown>) => ({
  at: '2026-11-22T12:00:00Z', level: 'success', provider: 'openai', model: 'gpt-5.6-terra',
  input_tokens: 4000, cached_input_tokens: 0, output_tokens: 1000, cost_usd: null,
  duration_ms: 20_000, transcription_segment_id: 'seg1', ...overrides,
});

describe('riepilogo della trascrizione', () => {
  beforeEach(() => {
    selectMock.mockReset();
  });

  it('conta testo, letture, pagine rilette, errori, cache e costo del documento e della pagina', async () => {
    selectMock
      .mockResolvedValueOnce([
        { text: 'Una pagina scritta', approved_revision_id: 'r1' },
        { text: 'Altre due parole qui', approved_revision_id: null },
        { text: null, approved_revision_id: null },
      ])
      .mockResolvedValueOnce([
        outcome({ transcription_segment_id: 'seg1', at: '2026-11-22T12:00:00Z' }),
        outcome({ transcription_segment_id: 'seg1', at: '2026-11-22T12:30:00Z', cached_input_tokens: 2000, duration_ms: 30_000 }),
        outcome({ transcription_segment_id: 'seg2', level: 'warn', cost_usd: 0.01, duration_ms: 10_000 }),
        outcome({ transcription_segment_id: 'seg2', level: 'error', input_tokens: null, output_tokens: null }),
      ]);

    const summary = await getTranscriptionSummary('td1', 'seg1', {});

    expect(summary.pagesWithText).toBe(2);
    expect(summary.verifiedPages).toBe(1);
    expect(summary.words).toBe(7);
    expect(summary.characters).toBe('Una pagina scritta'.length + 'Altre due parole qui'.length);
    expect(summary.ocr).toMatchObject({
      runs: 3, errors: 1, pagesRead: 2, rereads: 1,
      inputTokens: 12_000, cachedInputTokens: 2000, outputTokens: 3000,
      averageDurationMs: 20_000, lastAt: '2026-11-22T12:30:00Z',
      models: ['OpenAI gpt-5.6-terra'],
    });
    const fullRead = (4000 * 2.5 + 1000 * 15) / 1_000_000;
    const cachedRead = (2000 * 2.5 + 2000 * 0.25 + 1000 * 15) / 1_000_000;
    expect(summary.ocr.costUsd).toBeCloseTo(fullRead + cachedRead + 0.01, 10);
    expect(summary.page).toMatchObject({ runs: 2, errors: 0, pagesRead: 1, rereads: 1 });
    expect(summary.page.costUsd).toBeCloseTo(fullRead + cachedRead, 10);
    expect(selectMock.mock.calls[0][0]).toContain('ORDER BY revision_number DESC LIMIT 1');
    expect(selectMock.mock.calls[1][1]).toEqual(['td1']);
  });

  it('una pagina mai letta ha letture vuote e nessun costo', async () => {
    selectMock.mockResolvedValueOnce([]).mockResolvedValueOnce([outcome({ transcription_segment_id: 'seg2' })]);

    const summary = await getTranscriptionSummary('td1', 'seg1', {});

    expect(summary.page).toMatchObject({ runs: 0, errors: 0, pagesRead: 0, costUsd: 0, lastAt: null, models: [] });
  });

  it('il costo resta sconosciuto se un modello non ha prezzo', async () => {
    selectMock.mockResolvedValueOnce([]).mockResolvedValueOnce([outcome({ provider: 'mystery', model: 'x' })]);

    const summary = await getTranscriptionSummary('td1', null, {});

    expect(summary.ocr.costUsd).toBeNull();
  });
});
