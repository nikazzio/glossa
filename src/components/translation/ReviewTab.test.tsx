import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnotationsStore } from '../../stores/annotationsStore';
import { makeTranslationChunk } from '../../test/chunkFactory';
import { ReviewTab, type ReviewView } from './ReviewTab';

function renderReview(view: ReviewView, chunk = makeTranslationChunk({ id: 'c1' }), onViewChange = vi.fn()) {
  render(
    <ReviewTab
      panelId="review"
      labelledBy="review-tab"
      view={view}
      onViewChange={onViewChange}
      currentChunk={chunk}
      isProcessing={false}
      onReauditChunk={vi.fn()}
      onSelectChunk={vi.fn()}
      onFocusIssue={vi.fn()}
    />,
  );
  return { onViewChange };
}

describe('ReviewTab', () => {
  beforeEach(() => {
    useAnnotationsStore.setState({ annotationsByChunkId: new Map() });
  });

  it('keeps audit off, with the reason, until the chunk is translated, and shows the notes', () => {
    renderReview('audit');

    const audit = screen.getByRole('tab', { name: /document\.insightsTabAudit/ });
    expect(audit).toBeDisabled();
    expect(audit).toHaveAccessibleName('document.insightsTabAudit — document.chunkTabLockedForAudit');
    expect(screen.getByRole('tab', { name: 'document.insightsTabNotes' })).toHaveAttribute('aria-selected', 'true');
  });

  it('counts open audit findings and switches view on request', () => {
    const chunk = makeTranslationChunk({
      id: 'c1',
      status: 'completed',
      judgeResult: {
        content: '',
        status: 'completed',
        rating: 'fair',
        issues: [
          { type: 'terminology', severity: 'high', description: 'a' },
          { type: 'style', severity: 'low', description: 'b', resolved: true },
        ],
      } as never,
    });
    const { onViewChange } = renderReview('audit', chunk);

    expect(screen.getByRole('tab', { name: 'document.insightsTabAudit · 1' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'document.insightsTabNotes' }));
    expect(onViewChange).toHaveBeenCalledWith('notes');
  });

  it('offers the source notes only when the chunk has some', () => {
    renderReview('notes');
    expect(screen.queryByRole('tab', { name: /document\.reviewSourceNotes/ })).not.toBeInTheDocument();
  });

  it('lists the source notes of the chunk in their own view', () => {
    const chunk = makeTranslationChunk({ id: 'c1', footnotes: [{ id: 'f1', marker: '¹', text: 'Nota del curatore' }] as never });
    renderReview('sourceNotes', chunk);

    expect(screen.getByRole('tab', { name: 'document.reviewSourceNotes · 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Nota del curatore')).toBeInTheDocument();
  });
});

describe('ReviewTab notes', () => {
  it('opens a new note without any selection in the text', () => {
    useAnnotationsStore.setState({ annotationsByChunkId: new Map() });
    renderReview('notes');

    fireEvent.click(screen.getByRole('button', { name: 'annotations.addButton' }));

    expect(screen.getByPlaceholderText('annotations.placeholder')).toBeInTheDocument();
  });
});
