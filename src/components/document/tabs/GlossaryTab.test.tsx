import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { useUiStore } from '../../../stores/uiStore';
import { GlossaryTab } from './GlossaryTab';

function renderGlossaryTab(glossary: Array<{ term: string; translation: string }> = []) {
  return render(<GlossaryTab panelId="p" labelledBy="l" glossary={glossary} />);
}

describe('GlossaryTab', () => {
  beforeEach(() => {
    useUiStore.setState({ highlightsEnabled: false });
  });

  it('lists the terms with their translation under a title that counts them', () => {
    renderGlossaryTab([{ term: 'orafo', translation: 'goldsmith' }]);

    expect(screen.getByText('orafo')).toBeInTheDocument();
    expect(screen.getByText('goldsmith')).toBeInTheDocument();
    expect(screen.getByText(/document\.insightsTabGlossary · document\.glossaryTermCount/)).toBeInTheDocument();
  });

  it('shows the colour legend only while the terms are highlighted', () => {
    renderGlossaryTab();
    expect(screen.queryByText('library.glossaryLegendMatch')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'library.glossaryHighlightToggle' }));

    expect(screen.getByText('library.glossaryLegendMatch')).toBeInTheDocument();
    expect(screen.getByText('library.glossaryLegendMismatch')).toBeInTheDocument();
    expect(screen.getByText('library.glossaryLegendSourceTerm')).toBeInTheDocument();
  });
});
