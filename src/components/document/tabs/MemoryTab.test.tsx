import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryTab } from './MemoryTab';
import { useMemoryExtractionDraft } from '../../../hooks/useMemoryExtractionDraft';
import { confirm as confirmDialog } from '../../../stores/confirmStore';
import { makeTranslationChunk } from '../../../test/chunkFactory';
import type { PhraseCandidateDraft } from '../../../stores/phraseMemoryDraftStore';

vi.mock('../../../hooks/useMemoryExtractionDraft', () => ({ useMemoryExtractionDraft: vi.fn() }));
vi.mock('../../../stores/confirmStore', () => ({ confirm: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

const mockUseDraft = vi.mocked(useMemoryExtractionDraft);
const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });

const saved: PhraseCandidateDraft = {
  id: 's1', sourcePhrase: 'ciao', targetPhrase: 'hello', confidence: 1, origin: 'saved', accepted: true, entryId: 'e1',
};
const fresh: PhraseCandidateDraft = {
  id: 'n1', sourcePhrase: 'notte', targetPhrase: 'night', confidence: 0.9, origin: 'ai', accepted: true,
};

function draft(overrides: Partial<ReturnType<typeof useMemoryExtractionDraft>> = {}): ReturnType<typeof useMemoryExtractionDraft> {
  return {
    status: 'reviewing',
    candidates: [],
    canExtract: true,
    isLoadingSaved: false,
    extract: vi.fn(),
    addManualCandidate: vi.fn(),
    updateCandidate: vi.fn(),
    toggleAccepted: vi.fn(),
    confirm: vi.fn().mockResolvedValue(1),
    removeSaved: vi.fn().mockResolvedValue(undefined),
    savedCount: 0,
    savedLoadFailed: false,
    ...overrides,
  };
}

const renderTab = () => render(<MemoryTab panelId="p" labelledBy="l" currentChunk={chunk} />);

describe('MemoryTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows saved pairs read-only with their own remove command', () => {
    mockUseDraft.mockReturnValue(draft({ candidates: [saved], savedCount: 1 }));
    renderTab();
    expect(screen.getByText('memory.inMemoryBadge')).toBeInTheDocument();
    expect(screen.getByText('ciao')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'memory.removeFromMemory' })).toBeEnabled();
  });

  it('removes a saved pair only after confirmation', async () => {
    const removeSaved = vi.fn().mockResolvedValue(undefined);
    mockUseDraft.mockReturnValue(draft({ candidates: [saved], savedCount: 1, removeSaved }));
    vi.mocked(confirmDialog).mockResolvedValue(true);
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'memory.removeFromMemory' }));
    expect(confirmDialog).toHaveBeenCalled();
    expect(removeSaved).toHaveBeenCalledWith(saved);
  });

  it('turns the add command off, with its reason, when no new pair is checked', () => {
    mockUseDraft.mockReturnValue(draft({ candidates: [saved], savedCount: 1 }));
    renderTab();
    expect(screen.getByRole('button', { name: 'transcription.commandBlocked' })).toBeDisabled();
  });

  it('adds the checked new pairs to memory', async () => {
    const confirm = vi.fn().mockResolvedValue(1);
    mockUseDraft.mockReturnValue(draft({ candidates: [saved, fresh], savedCount: 1, confirm }));
    renderTab();
    await userEvent.click(screen.getByRole('button', { name: 'memory.addCheckedToMemory' }));
    expect(confirm).toHaveBeenCalled();
  });

  it('says when the chunk memory could not be read', () => {
    mockUseDraft.mockReturnValue(draft({ savedLoadFailed: true }));
    renderTab();
    expect(screen.getByRole('alert')).toHaveTextContent('memory.savedLoadFailed');
  });
});
