import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePageNotes } from './usePageNotes';
import { listSegmentNotes } from '../../../services/transcriptionNotesService';
import type { Job } from '../../../services/jobsService';

const listeners: Array<(job: Job) => void> = [];
vi.mock('../../../services/jobsService', () => ({
  OCR_JOB_TYPE: 'ocr_page',
  onJobChanged: vi.fn(async (handler: (job: Job) => void) => {
    listeners.push(handler);
    return () => undefined;
  }),
}));
vi.mock('../../../services/transcriptionNotesService', () => ({
  listSegmentNotes: vi.fn(),
  createNote: vi.fn(),
  deleteNote: vi.fn(),
  updateNote: vi.fn(),
}));

const segment = { id: 'seg1', document_id: 'd1', position: 0, label: null, source_page_id: null, approved_revision_id: null };
const note = (id: string) => ({
  id, segmentId: 'seg1', type: 'doubt' as const, content: id, passage: null, occurrence: null,
  origin: 'model' as const, sortOrder: 0, createdAt: '',
});

beforeEach(() => {
  listeners.length = 0;
  vi.mocked(listSegmentNotes).mockReset();
});

describe('note della pagina aperta', () => {
  it('si rileggono a fine lettura anche se il testo non è cambiato', async () => {
    let rewritten = false;
    vi.mocked(listSegmentNotes).mockImplementation(async () => [note(rewritten ? 'nuova' : 'vecchia')]);
    const { result } = renderHook(() => usePageNotes(segment, 'Et dixit', []));
    await waitFor(() => expect(result.current.notes.map((entry) => entry.id)).toEqual(['vecchia']));
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));

    rewritten = true;
    act(() => {
      listeners.forEach((listener) => listener({
        jobType: 'ocr_page', status: 'completed', config: JSON.stringify({ pages: [{ segmentId: 'seg1' }] }),
      } as Job));
    });

    await waitFor(() => expect(result.current.notes.map((entry) => entry.id)).toEqual(['nuova']));
  });

  it('una lettura di un altra pagina non le rilegge', async () => {
    vi.mocked(listSegmentNotes).mockResolvedValue([note('vecchia')]);
    renderHook(() => usePageNotes(segment, 'Et dixit', []));
    await waitFor(() => expect(listeners.length).toBeGreaterThan(0));
    const before = vi.mocked(listSegmentNotes).mock.calls.length;
    act(() => {
      listeners.forEach((listener) => listener({
        jobType: 'ocr_page', status: 'completed', config: JSON.stringify({ pages: [{ segmentId: 'altra' }] }),
      } as Job));
    });
    expect(listSegmentNotes).toHaveBeenCalledTimes(before);
  });
});
