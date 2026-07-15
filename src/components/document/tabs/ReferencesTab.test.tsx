import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReferencesTab } from './ReferencesTab';
import { usePhraseMemoryMatches } from '../../../hooks/usePhraseMemoryMatches';
import { makeTranslationChunk } from '../../../test/chunkFactory';

vi.mock('../../../hooks/usePhraseMemoryMatches', () => ({
  usePhraseMemoryMatches: vi.fn(),
}));
vi.mock('../../../hooks/usePhraseMemoryAutoSearch', () => ({
  usePhraseMemoryAutoSearch: vi.fn(() => ({ runSearchForChunk: vi.fn(), runSearch: vi.fn(), status: 'idle' })),
}));
vi.mock('../../../stores/phraseMemoryStore', async () => {
  const actual = await vi.importActual<typeof import('../../../stores/phraseMemoryStore')>('../../../stores/phraseMemoryStore');
  return { ...actual, usePhraseMemoryStore: (selector: (s: unknown) => unknown) => selector({ searchStatus: 'idle' }) };
});
vi.mock('../../../stores/pipelineStore', () => ({
  usePipelineStore: (selector: (s: unknown) => unknown) =>
    selector({ config: { phraseMemorySimilarityThreshold: 0.75 }, setConfig: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUseMatches = vi.mocked(usePhraseMemoryMatches);

function noMatches() {
  return { matches: [], enabledMatchIds: new Set<string>(), selectedMatches: [], hasMatches: false, toggleEnabled: vi.fn() };
}

describe('ReferencesTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra il testo di stato vuoto quando non ci sono match', () => {
    mockUseMatches.mockReturnValue(noMatches());
    const chunk = makeTranslationChunk({ id: 'c1' });
    render(<ReferencesTab panelId="p" labelledBy="l" currentChunk={chunk} glossary={[]} />);
    expect(screen.getByText('memory.coldStartBodyShort')).toBeInTheDocument();
  });

  it('mostra i match trovati con checkbox abilita/disabilita', async () => {
    const toggleEnabled = vi.fn();
    mockUseMatches.mockReturnValue({
      matches: [{ id: 'm1', sourcePhrase: 'ciao', targetPhrase: 'hello', score: 0.9, confidence: 0.9, createdAt: '2026-01-01' }],
      enabledMatchIds: new Set(),
      selectedMatches: [],
      hasMatches: true,
      toggleEnabled,
    });
    const chunk = makeTranslationChunk({ id: 'c1' });
    const user = userEvent.setup();
    render(<ReferencesTab panelId="p" labelledBy="l" currentChunk={chunk} glossary={[]} />);

    expect(screen.getByText('ciao')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'memory.enableMatch' }));
    expect(toggleEnabled).toHaveBeenCalledWith('m1');
  });

  it('mostra il glossario del progetto per intero, senza filtro', () => {
    mockUseMatches.mockReturnValue(noMatches());
    const chunk = makeTranslationChunk({ id: 'c1' });
    render(
      <ReferencesTab
        panelId="p"
        labelledBy="l"
        currentChunk={chunk}
        glossary={[{ id: 'g1', term: 'ciao', translation: 'hello' }]}
      />,
    );
    expect(screen.getByText('ciao')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('mostra il messaggio di glossario assente quando non è assegnato nessun glossario', () => {
    mockUseMatches.mockReturnValue(noMatches());
    const chunk = makeTranslationChunk({ id: 'c1' });
    render(<ReferencesTab panelId="p" labelledBy="l" currentChunk={chunk} glossary={[]} />);
    expect(screen.getByText('memory.referencesGlossaryEmpty')).toBeInTheDocument();
  });
});
