import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtractTermDialog } from './ExtractTermDialog';

import { createGlossary, addGlossaryEntry } from '../../services/glossaryService';

vi.mock('../../services/glossaryService', () => ({
  listGlossaries: vi.fn(() => Promise.resolve([])),
  addGlossaryEntry: vi.fn(() => Promise.resolve()),
  createGlossary: vi.fn(() => Promise.resolve('new-gls-id')),
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

  it('crea un nuovo dizionario al volo e vi aggiunge il termine', async () => {
    const user = userEvent.setup();
    render(
      <ExtractTermDialog
        sourcePhrase="lorem ipsum"
        targetPhrase="dolor sit"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByRole('dialog');
    // term precompilato dal suggerimento mockato ('lex')
    await user.selectOptions(
      screen.getByLabelText('glossary.selectGlossary'),
      '__create_new__',
    );
    await user.type(
      screen.getByLabelText('glossary.newGlossaryNamePlaceholder'),
      'Mio dizionario',
    );
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));
    expect(createGlossary).toHaveBeenCalledWith('Mio dizionario', '', '', '', null);
    expect(addGlossaryEntry).toHaveBeenCalledWith(
      'new-gls-id',
      expect.objectContaining({ term: 'lex' }),
    );
  });

  it('al retry dopo un inserimento fallito non ricrea il dizionario', async () => {
    vi.mocked(addGlossaryEntry)
      .mockRejectedValueOnce(new Error('db'))
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(
      <ExtractTermDialog
        sourcePhrase="lorem ipsum"
        targetPhrase="dolor sit"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await screen.findByRole('dialog');
    await user.selectOptions(screen.getByLabelText('glossary.selectGlossary'), '__create_new__');
    await user.type(screen.getByLabelText('glossary.newGlossaryNamePlaceholder'), 'Mio dizionario');

    // primo tentativo: createGlossary ok, addGlossaryEntry fallisce
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));
    // retry: deve riusare lo stesso glossario, non crearne uno nuovo
    await user.click(screen.getByRole('button', { name: 'common.confirm' }));

    expect(createGlossary).toHaveBeenCalledTimes(1);
    expect(addGlossaryEntry).toHaveBeenCalledTimes(2);
    expect(addGlossaryEntry).toHaveBeenNthCalledWith(2, 'new-gls-id', expect.objectContaining({ term: 'lex' }));
  });
});
