import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryTab } from './MemoryTab';
import { useMemoryExtractionDraft } from '../../../hooks/useMemoryExtractionDraft';
import { listPhraseMemoryEntries } from '../../../services/phraseMemoryService';
import { makeTranslationChunk } from '../../../test/chunkFactory';

vi.mock('../../../hooks/useMemoryExtractionDraft', () => ({
  useMemoryExtractionDraft: vi.fn(),
}));
vi.mock('../../../services/phraseMemoryService', () => ({
  listPhraseMemoryEntries: vi.fn(() => Promise.resolve([])),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock('../../../stores/workspaceStore', () => ({
  useWorkspaceStore: (selector: (s: unknown) => unknown) =>
    selector({ activeWorkspace: { id: 'ws-1' } }),
}));

const mockUseDraft = vi.mocked(useMemoryExtractionDraft);

function baseDraft(overrides: Partial<ReturnType<typeof useMemoryExtractionDraft>> = {}) {
  return {
    status: 'idle' as const,
    candidates: [],
    expanded: false,
    canExtract: false,
    extract: vi.fn(),
    addManualCandidate: vi.fn(),
    updateCandidate: vi.fn(),
    toggleAccepted: vi.fn(),
    removeCandidate: vi.fn(),
    toggleExpanded: vi.fn(),
    confirm: vi.fn(),
    ...overrides,
  };
}

describe('MemoryTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disabilita il bottone di estrazione se il frammento non è bloccato', () => {
    mockUseDraft.mockReturnValue(baseDraft({ canExtract: false }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: false });
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByRole('button', { name: 'memory.extractDisabledLockHint' })).toBeDisabled();
  });

  it('abilita il bottone di estrazione se il frammento è bloccato e lo attiva al click', async () => {
    const extract = vi.fn();
    mockUseDraft.mockReturnValue(baseDraft({ canExtract: true, extract }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    const user = userEvent.setup();
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    const button = screen.getByRole('button', { name: 'memory.extractButton' });
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(extract).toHaveBeenCalled();
  });

  it('mostra le candidate in revisione (lista espansa) e permette di modificarle e scartarle', async () => {
    const toggleAccepted = vi.fn();
    const updateCandidate = vi.fn();
    const removeCandidate = vi.fn();
    mockUseDraft.mockReturnValue(baseDraft({
      status: 'reviewing',
      expanded: true,
      candidates: [
        { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
      ],
      toggleAccepted,
      updateCandidate,
      removeCandidate,
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    const user = userEvent.setup();
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);

    expect(screen.getByDisplayValue('ciao')).toBeInTheDocument();
    expect(screen.getByDisplayValue('hello')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox'));
    expect(toggleAccepted).toHaveBeenCalledWith('p1');

    await user.click(screen.getByRole('button', { name: 'memory.removeCandidateButton' }));
    expect(removeCandidate).toHaveBeenCalledWith('p1');
  });

  it('la lista di revisione non è visibile se la lista non è espansa', () => {
    mockUseDraft.mockReturnValue(baseDraft({
      status: 'reviewing',
      expanded: false,
      candidates: [
        { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
      ],
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.queryByDisplayValue('ciao')).not.toBeInTheDocument();
  });

  it('una candidate di origine "saved" mostra l\'etichetta già salvata invece della percentuale', () => {
    mockUseDraft.mockReturnValue(baseDraft({
      status: 'reviewing',
      expanded: true,
      candidates: [
        { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 1, origin: 'saved', accepted: true },
      ],
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByText('memory.savedCandidateLabel')).toBeInTheDocument();
  });

  it('il bottone aggiungi manuale richiama addManualCandidate se il frammento è bloccato', async () => {
    const addManualCandidate = vi.fn();
    mockUseDraft.mockReturnValue(baseDraft({ status: 'reviewing', expanded: true, candidates: [], addManualCandidate }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    const user = userEvent.setup();
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    await user.click(screen.getByText('memory.addManualPairButton'));
    expect(addManualCandidate).toHaveBeenCalled();
  });

  it('il bottone aggiungi manuale è disabilitato se il frammento non è bloccato', () => {
    mockUseDraft.mockReturnValue(baseDraft({ status: 'reviewing', expanded: true, candidates: [] }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: false });
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByText('memory.addManualPairButton').closest('button')).toBeDisabled();
  });

  it('il bottone aggiorna è nell\'intestazione, disabilitato se nessuna riga è accettata e valida', () => {
    mockUseDraft.mockReturnValue(baseDraft({
      status: 'reviewing',
      expanded: true,
      candidates: [
        { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: false },
        { id: 'p2', sourcePhrase: '', targetPhrase: '', confidence: 1, origin: 'manual', accepted: true },
      ],
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByText('memory.confirmSaveButton')).toBeDisabled();
  });

  it('il bottone aggiorna è disabilitato se il frammento non è bloccato, anche con righe accettate', () => {
    mockUseDraft.mockReturnValue(baseDraft({
      status: 'reviewing',
      expanded: true,
      candidates: [
        { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 1, origin: 'saved', accepted: true },
      ],
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: false });
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByText('memory.confirmSaveButton')).toBeDisabled();
  });

  it('aggiorna chiama confirm() quando ci sono righe accettate valide su frammento bloccato', async () => {
    const confirm = vi.fn(() => Promise.resolve(1));
    mockUseDraft.mockReturnValue(baseDraft({
      status: 'reviewing',
      expanded: true,
      candidates: [
        { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
      ],
      confirm,
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    const user = userEvent.setup();
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    await user.click(screen.getByText('memory.confirmSaveButton'));
    expect(confirm).toHaveBeenCalled();
  });

  it('mostra il conteggio delle memorie già salvate per il frammento e il bottone per mostrarle/nasconderle', async () => {
    vi.mocked(listPhraseMemoryEntries).mockResolvedValueOnce([
      { id: 'm1', workspaceId: 'ws-1', sourcePhrase: 'a', targetPhrase: 'b', confidence: 1, sourceLanguage: 'it', targetLanguage: 'en', author: null, work: null, domain: null, tags: null, notes: null, chunkId: 'c1', projectId: 'p1', embeddingModel: null, createdAt: '2026-01-01' },
    ]);
    const toggleExpanded = vi.fn();
    mockUseDraft.mockReturnValue(baseDraft({ toggleExpanded }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: false });
    const user = userEvent.setup();
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(await screen.findByText('1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'memory.toggleSavedListShow' }));
    expect(toggleExpanded).toHaveBeenCalled();
  });

  it('disabilita i controlli della lista di revisione mentre estrazione o salvataggio sono in corso', () => {
    mockUseDraft.mockReturnValue(baseDraft({
      status: 'saving',
      expanded: true,
      candidates: [
        { id: 'p1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 0.9, origin: 'ai', accepted: true },
      ],
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByDisplayValue('ciao')).toBeDisabled();
  });

  it('non mostra il bottone mostra/nascondi se non ci sono memorie salvate per il frammento', async () => {
    mockUseDraft.mockReturnValue(baseDraft());
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: false });
    render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);
    await screen.findByText('0');
    expect(screen.queryByRole('button', { name: 'memory.toggleSavedListShow' })).not.toBeInTheDocument();
  });
});
