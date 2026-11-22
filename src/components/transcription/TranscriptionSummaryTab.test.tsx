import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TranscriptionSummaryTab } from './TranscriptionSummaryTab';
import type { TranscriptionRevision } from '../../services/transcriptionService';
import type { OcrUsage, TranscriptionSummary } from '../../services/transcriptionSummaryService';

const getSummary = vi.hoisted(() => vi.fn());
vi.mock('../../services/transcriptionSummaryService', () => ({ getTranscriptionSummary: getSummary }));
const jobListener = vi.hoisted(() => ({ current: null as null | ((job: { jobType: string }) => void) }));
vi.mock('../../services/jobsService', () => ({
  OCR_JOB_TYPE: 'ocr_page',
  onJobChanged: vi.fn((listener: (job: { jobType: string }) => void) => {
    jobListener.current = listener;
    return Promise.resolve(() => { jobListener.current = null; });
  }),
}));

const usage = (overrides: Partial<OcrUsage> = {}): OcrUsage => ({
  runs: 0, errors: 0, pagesRead: 0, rereads: 0, inputTokens: 0, cachedInputTokens: 0,
  outputTokens: 0, costUsd: 0, averageDurationMs: null, lastAt: null, models: [], ...overrides,
});

const summary = (overrides: Partial<TranscriptionSummary> = {}): TranscriptionSummary => ({
  pagesWithText: 11, verifiedPages: 4, words: 2310, characters: 14_820,
  ocr: usage({
    runs: 14, errors: 1, pagesRead: 11, rereads: 3, inputTokens: 58_200, cachedInputTokens: 23_862,
    outputTokens: 24_900, costUsd: 0.52, averageDurationMs: 26_000, lastAt: '2026-11-22T12:53:58Z',
    models: ['OpenAI gpt-5.6-terra'],
  }),
  page: usage(),
  ...overrides,
});

const revision = (n: number, createdBy: TranscriptionRevision['created_by']): TranscriptionRevision => ({
  id: `s1:r${n}`, segment_id: 's1', revision_number: n, text: 'Testo', created_by: createdBy,
  derived_from_revision_id: null, content_hash: `h${n}`, consolidated_name: null, created_at: '2026-11-22',
});

function renderTab(revisions: TranscriptionRevision[]) {
  render(<TranscriptionSummaryTab documentId="d1" segmentId="s1" displayIndex={10} pageLabel="6r"
    pageTotal={240} verified={false} revisions={revisions} />);
}

describe('riepilogo della trascrizione', () => {
  it('mostra letture, errori, pagine rilette, cache e costo del documento', async () => {
    getSummary.mockResolvedValue(summary());
    renderTab([revision(1, 'ocr')]);

    expect(await screen.findByText('transcription.summary.runsValue')).toBeInTheDocument();
    expect(screen.getByText('transcription.summary.pagesReadValue')).toBeInTheDocument();
    expect(screen.getByText('transcription.summary.tokensSentValue')).toBeInTheDocument();
    expect(screen.getByText('transcription.summary.costValue')).toBeInTheDocument();
    expect(screen.getByText('OpenAI gpt-5.6-terra')).toBeInTheDocument();
    expect(screen.getByText('2,310 · 14,820')).toBeInTheDocument();
    expect(getSummary).toHaveBeenCalledWith('d1', 's1', {});
  });

  it('per una pagina mai letta mostra le versioni a mano e nessuna lettura né costo', async () => {
    getSummary.mockResolvedValue(summary());
    renderTab([revision(2, 'user'), revision(1, 'user')]);

    await screen.findByText('transcription.summary.runsValue');
    expect(screen.getByText('transcription.summary.versionsSplit')).toBeInTheDocument();
    expect(screen.queryByText('transcription.summary.pageReads')).not.toBeInTheDocument();
    expect(screen.queryByText('transcription.summary.pageCost')).not.toBeInTheDocument();
  });

  it('un documento senza letture automatiche mostra solo il conteggio a zero', async () => {
    getSummary.mockResolvedValue(summary({ ocr: usage() }));
    renderTab([]);

    await screen.findByText('transcription.summary.runsValue');
    expect(screen.queryByText('transcription.summary.tokensSent')).not.toBeInTheDocument();
  });

  it('ricarica i totali quando cambia un lavoro di lettura, anche senza nuove versioni', async () => {
    getSummary.mockReset().mockResolvedValue(summary());
    renderTab([]);
    await screen.findByText('transcription.summary.runsValue');
    await waitFor(() => expect(jobListener.current).not.toBeNull());
    const calls = getSummary.mock.calls.length;

    act(() => { jobListener.current?.({ jobType: 'ocr_page' }); });

    await waitFor(() => expect(getSummary.mock.calls.length).toBe(calls + 1));
  });
});
