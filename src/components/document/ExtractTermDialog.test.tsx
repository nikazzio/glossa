import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtractTermDialog } from './ExtractTermDialog';

vi.mock('../../services/glossaryService', () => ({
  listGlossaries: vi.fn(() => Promise.resolve([])),
  addGlossaryEntry: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../services/llmService', () => ({
  extractTermFromPhrase: vi.fn(() => Promise.resolve({ term: 'lex', confidence: 1 })),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../stores/pipelineStore', () => ({
  usePipelineStore: (selector: (s: unknown) => unknown) =>
    selector({ config: { stages: [{ provider: 'openai', model: 'gpt-4o' }], assignedGlossaryId: null } }),
}));

describe('ExtractTermDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chiude con Escape', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ExtractTermDialog
        sourcePhrase="lorem ipsum"
        targetPhrase="dolor sit"
        onClose={onClose}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('chiude dal pulsante annulla', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <ExtractTermDialog
        sourcePhrase="lorem ipsum"
        targetPhrase="dolor sit"
        onClose={onClose}
        onSuccess={vi.fn()}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'common.cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
