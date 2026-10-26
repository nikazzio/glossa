import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TranscriptionHistoryTab } from './TranscriptionHistoryTab';
import type { TranscriptionRevision, TranscriptionSegment } from '../../services/transcriptionService';

const segment: TranscriptionSegment = {
  id: 's1', document_id: 'd1', position: 0, label: null,
  source_page_id: null, approved_revision_id: null,
};
const revisions: TranscriptionRevision[] = [
  { id: 'r3', segment_id: 's1', revision_number: 3, text: 'Corrente',
    created_by: 'user', derived_from_revision_id: 'r2', content_hash: 'h3',
    consolidated_name: null, created_at: '2026-09-23' },
  { id: 'r2', segment_id: 's1', revision_number: 2, text: 'Scelta',
    created_by: 'user', derived_from_revision_id: 'r1', content_hash: 'h2',
    consolidated_name: 'Versione scelta', created_at: '2026-09-22' },
  { id: 'r1', segment_id: 's1', revision_number: 1, text: 'Iniziale',
    created_by: 'ocr', derived_from_revision_id: null, content_hash: 'h1',
    consolidated_name: null, created_at: '2026-09-21' },
];

describe('storico della trascrizione', () => {
  it('separa i consolidati, rende ripristinabili gli OCR e protegge la versione corrente', async () => {
    const onRestore = vi.fn();
    const onClear = vi.fn();
    render(<TranscriptionHistoryTab revisions={revisions} segment={segment} draft="Corrente"
      formatDate={(value) => value} onRestore={onRestore} onDelete={vi.fn()}
      onName={vi.fn()} onClear={onClear} pending={false} pendingError={null} />);

    const consolidated = screen.getByRole('list', { name: 'transcription.consolidatedVersions' });
    expect(within(consolidated).getByText('Versione scelta')).toBeInTheDocument();
    expect(within(consolidated).getByText('Scelta')).toBeInTheDocument();
    const history = screen.getByRole('list', { name: 'transcription.tabs.history' });
    expect(within(history).getByText('Iniziale')).toBeInTheDocument();
    await userEvent.click(within(history).getAllByRole('button', { name: 'transcription.restore' })[0]);
    expect(onRestore).toHaveBeenCalledWith('r1');
    await userEvent.click(screen.getByRole('button', { name: 'transcription.clearHistory' }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(within(history).getByRole('button', { name: 'transcription.alreadyCurrent' })).toBeDisabled();
    expect(within(history).getByText(/transcription\.currentBadge/)).toBeInTheDocument();
    expect(within(history).getAllByRole('button', { name: 'transcription.cannotDeleteCurrentOrVerified' })[0])
      .toBeDisabled();
  });

  it('dice che non resta altro salvataggio quando ci sono solo versioni consolidate', () => {
    render(<TranscriptionHistoryTab revisions={[revisions[1]]} segment={segment} draft="Scelta"
      formatDate={(value) => value} onRestore={vi.fn()} onDelete={vi.fn()}
      onName={vi.fn()} onClear={vi.fn()} pending={false} pendingError={null} />);

    expect(screen.getByText('transcription.noOtherRevisions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'transcription.clearHistoryNothing' })).toBeDisabled();
  });
});
