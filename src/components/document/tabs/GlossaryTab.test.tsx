import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GlossaryTab } from './GlossaryTab';

function renderGlossaryTab(glossary: Array<{ term: string; translation: string }> = []) {
  return render(
    <GlossaryTab panelId="p" labelledBy="l" glossary={glossary} />,
  );
}

describe('GlossaryTab — legenda colori evidenziazione', () => {
  it('mostra le tre voci della legenda con la relativa spiegazione', () => {
    renderGlossaryTab();

    expect(screen.getByText('library.glossaryLegendMatch')).toBeInTheDocument();
    expect(screen.getByText('library.glossaryLegendMismatch')).toBeInTheDocument();
    expect(screen.getByText('library.glossaryLegendSourceTerm')).toBeInTheDocument();
  });

  it('mostra la legenda indipendentemente dal contenuto del glossario', () => {
    renderGlossaryTab([{ term: 'foo', translation: 'bar' }]);

    expect(screen.getByText('library.glossaryLegendMatch')).toBeInTheDocument();
  });
});
