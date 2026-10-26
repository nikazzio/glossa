import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeTranslationChunk } from '../../test/chunkFactory';
import { DocumentGroupTab } from './DocumentGroupTab';

function renderGroup(onViewChange = vi.fn()) {
  render(
    <DocumentGroupTab
      panelId="d"
      labelledBy="d-tab"
      view="stats"
      onViewChange={onViewChange}
      chunks={[makeTranslationChunk({ id: 'c1', sourceDisplayText: 'Uno due' })]}
      currentChunk={null}
      isProcessing={false}
      onSelectChunk={vi.fn()}
      onFocusIssue={vi.fn()}
      onRunCoherenceAudit={vi.fn()}
    />,
  );
  return { onViewChange };
}

describe('DocumentGroupTab', () => {
  it('gathers index, statistics and coherence of the whole document as sub-tabs', () => {
    const { onViewChange } = renderGroup();

    expect(screen.getByRole('tab', { name: 'document.insightsTabStats' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'document.insightsTabCoherence' }));
    expect(onViewChange).toHaveBeenCalledWith('coherence');
    expect(screen.getByRole('tab', { name: 'document.insightsTabIndex' })).toBeInTheDocument();
  });
});
