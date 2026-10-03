import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslationHistoryList } from './TranslationHistoryList';
import { useChunksStore } from '../../stores/chunksStore';
import { makeTranslationChunk } from '../../test/chunkFactory';
import { toast } from 'sonner';
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const service = vi.hoisted(() => ({
  listTranslationRevisions: vi.fn(),
  recordManualRevision: vi.fn(),
}));
vi.mock('../../services/translationRevisionsService', () => service);

const revisions = [
  { id: 'c1:r2', translation_id: 'c1', revision_number: 2, text: 'Corretta', created_by: 'human', derived_from_revision_id: 'c1:r1', content_hash: 'h2', created_at: '2026-10-02 10:00:00' },
  { id: 'c1:r1', translation_id: 'c1', revision_number: 1, text: 'Dalla pipeline', created_by: 'model', derived_from_revision_id: null, content_hash: 'h1', created_at: '2026-10-02 09:00:00' },
];

describe('TranslationHistoryList', () => {
  const updateChunkDraft = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    service.listTranslationRevisions.mockResolvedValue({ revisions, approvedRevisionId: 'c1:r2' });
    service.recordManualRevision.mockResolvedValue(null);
    useChunksStore.setState({ updateChunkDraft });
  });

  it('shows every version with its author, newest first, marking current and verified', async () => {
    render(<TranslationHistoryList panelId="p" labelledBy="t" currentChunk={makeTranslationChunk({ id: 'c1', translationDisplayText: 'Corretta' })} />);

    expect(await screen.findByText('Dalla pipeline')).toBeInTheDocument();
    expect(screen.getByText('document.historyAuthor.human')).toBeInTheDocument();
    expect(screen.getByText('document.historyAuthor.model')).toBeInTheDocument();
    expect(screen.getByText(/transcription\.currentBadge/)).toBeInTheDocument();
    expect(screen.getByText(/transcription\.verifiedVersionBadge/)).toBeInTheDocument();
  });

  it('restores an older version into the page and writes it as a new version', async () => {
    render(<TranslationHistoryList panelId="p" labelledBy="t" currentChunk={makeTranslationChunk({ id: 'c1', translationDisplayText: 'Corretta' })} />);
    await screen.findByText('Dalla pipeline');

    fireEvent.click(screen.getByRole('button', { name: 'transcription.restore' }));

    expect(updateChunkDraft).toHaveBeenCalledWith('c1', 'Dalla pipeline');
    expect(service.recordManualRevision).toHaveBeenCalledWith('c1', 'Dalla pipeline');
  });

  it('keeps restore off, with the reason, on a verified translation', async () => {
    render(<TranslationHistoryList panelId="p" labelledBy="t" currentChunk={makeTranslationChunk({ id: 'c1', translationDisplayText: 'Corretta', translationLocked: true })} />);
    await screen.findByText('Dalla pipeline');

    expect(screen.getByRole('button', { name: 'transcription.commandBlocked' })).toBeDisabled();
  });

  it('shows a translated history load failure without the database details', async () => {
    service.listTranslationRevisions.mockRejectedValueOnce(new Error('no such table: private'));
    render(<TranslationHistoryList panelId="p" labelledBy="t" currentChunk={makeTranslationChunk({ id: 'c1' })} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('document.historyLoadFailed');
    expect(screen.queryByText(/no such table/)).not.toBeInTheDocument();
  });

  it('shows only translated feedback when recording a restore fails', async () => {
    service.recordManualRevision.mockRejectedValueOnce(new Error('private constraint'));
    render(<TranslationHistoryList panelId="p" labelledBy="t" currentChunk={makeTranslationChunk({ id: 'c1', translationDisplayText: 'Corretta' })} />);
    await screen.findByText('Dalla pipeline');
    fireEvent.click(screen.getByRole('button', { name: 'transcription.restore' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('document.versionSaveFailed'));
  });
});
