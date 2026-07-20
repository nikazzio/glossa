import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { AuditTab } from './AuditTab';
import { usePipelineStore } from '../../../stores/pipelineStore';
import { makeTranslationChunk } from '../../../test/chunkFactory';

vi.mock('../../../stores/chunksStore', () => ({
  useChunksStore: (selector: (s: unknown) => unknown) =>
    selector({ toggleJudgeIssueResolved: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

function renderAuditTab(chunk = makeTranslationChunk({ id: 'c1' })) {
  return render(
    <AuditTab
      panelId="p"
      labelledBy="l"
      currentChunk={chunk}
      isProcessing={false}
      onReauditChunk={vi.fn()}
      onSelectChunk={vi.fn()}
      onFocusIssue={vi.fn()}
    />,
  );
}

describe('AuditTab — bottone "usa come esempio di stile"', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePipelineStore.setState((state) => ({
      ...state,
      config: { ...state.config, fewShotExamples: [] },
    }));
  });

  it('è disabilitato se il frammento non è bloccato', () => {
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: false });
    renderAuditTab(chunk);
    expect(screen.getByRole('button', { name: 'memory.addFewShotDisabledLockHint' })).toBeDisabled();
  });

  it('mostra il conteggio corrente accanto al bottone', () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        fewShotExamples: [{ id: 'fs-1', sourceChunkId: 'other', sourceText: 'a', targetText: 'b' }],
      },
    }));
    renderAuditTab(makeTranslationChunk({ id: 'c1', translationLocked: true }));
    expect(screen.getByText('1/5')).toBeInTheDocument();
  });

  it('aggiunge un esempio alla pipeline al click su un frammento bloccato', async () => {
    const chunk = makeTranslationChunk({
      id: 'c1',
      translationLocked: true,
      sourceDisplayText: 'Hello world',
      translationDisplayText: 'Ciao mondo',
    });
    const user = userEvent.setup();
    renderAuditTab(chunk);
    await user.click(screen.getByRole('button', { name: 'memory.addFewShotButton' }));

    const examples = usePipelineStore.getState().config.fewShotExamples ?? [];
    expect(examples).toHaveLength(1);
    expect(examples[0]).toMatchObject({
      sourceChunkId: 'c1',
      sourceText: 'Hello world',
      targetText: 'Ciao mondo',
    });
    expect(toast.success).toHaveBeenCalledWith('memory.addFewShotSuccess');
  });

  it('non duplica se il chunk è già stato aggiunto come esempio', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        fewShotExamples: [{ id: 'fs-1', sourceChunkId: 'c1', sourceText: 'a', targetText: 'b' }],
      },
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    const user = userEvent.setup();
    renderAuditTab(chunk);
    const button = screen.getByRole('button', { name: 'memory.addFewShotAlreadyAdded' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(usePipelineStore.getState().config.fewShotExamples).toHaveLength(1);
  });

  it('rispetta il tetto massimo di esempi', async () => {
    usePipelineStore.setState((state) => ({
      ...state,
      config: {
        ...state.config,
        fewShotExamples: Array.from({ length: 5 }, (_, i) => ({
          id: `fs-${i}`,
          sourceChunkId: `other-${i}`,
          sourceText: 'a',
          targetText: 'b',
        })),
      },
    }));
    const chunk = makeTranslationChunk({ id: 'c1', translationLocked: true });
    const user = userEvent.setup();
    renderAuditTab(chunk);
    await user.click(screen.getByRole('button', { name: 'memory.addFewShotButton' }));
    expect(usePipelineStore.getState().config.fewShotExamples).toHaveLength(5);
    expect(toast.message).toHaveBeenCalledWith('memory.addFewShotCapReached');
  });
});
