import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useTranscriptionStore } from './transcriptionStore';
import { getDocument } from '../services/transcriptionService';

vi.mock('../services/transcriptionService', () => ({ getDocument: vi.fn() }));

const getDocumentMock = vi.mocked(getDocument);

function documentOf(id: string) {
  return {
    id, source_version_id: null, workspace_id: 'w1', title: id, status: 'active' as const,
    ocr_provider: null, ocr_model: null, ocr_prompt: null,
  };
}

describe('transcriptionStore — richieste in corsa', () => {
  beforeEach(() => {
    getDocumentMock.mockReset();
    useTranscriptionStore.setState({ detail: null, loading: false, error: null });
  });

  it('una risposta lenta di un documento precedente non sovrascrive quello aperto dopo', async () => {
    let resolveSlow: (value: ReturnType<typeof documentOf>) => void = () => {};
    getDocumentMock.mockImplementation((id) => {
      if (id === 'A') return new Promise((resolve) => { resolveSlow = resolve; });
      return Promise.resolve(documentOf(id));
    });

    const slowLoad = useTranscriptionStore.getState().loadDetail('A');
    await useTranscriptionStore.getState().loadDetail('B');
    expect(useTranscriptionStore.getState().detail?.id).toBe('B');

    resolveSlow(documentOf('A'));
    await slowLoad;

    expect(useTranscriptionStore.getState().detail?.id).toBe('B');
  });
});
