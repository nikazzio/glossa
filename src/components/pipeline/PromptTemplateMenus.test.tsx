import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptTemplateMenus } from './PromptTemplateMenus';
import type { PromptTemplate } from '../../types';

const template = { id: 't1', name: 'Formale', prompt: 'Traduci in registro formale.', context: 'stage' } as PromptTemplate;

const renderMenus = (overrides: Partial<Parameters<typeof PromptTemplateMenus>[0]> = {}) => {
  const props = {
    templates: [template],
    value: 'testo attuale',
    onApplyTemplate: vi.fn(),
    saveTemplate: vi.fn().mockResolvedValue(undefined),
    templateContext: 'stage' as const,
    templateWorkflow: 'translation' as const,
    ...overrides,
  };
  render(<PromptTemplateMenus {...props} />);
  return props;
};

describe('PromptTemplateMenus', () => {
  it('applies a saved template from the list and offers no delete', async () => {
    const user = userEvent.setup();
    const props = renderMenus();
    await user.click(screen.getByRole('button', { name: 'pipeline.templates.load' }));
    expect(screen.queryByRole('button', { name: 'common.delete' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Formale/ }));
    expect(props.onApplyTemplate).toHaveBeenCalledWith(template);
  });

  it('filters the list by name', async () => {
    const user = userEvent.setup();
    renderMenus();
    await user.click(screen.getByRole('button', { name: 'pipeline.templates.load' }));
    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('pipeline.templates.empty')).toBeInTheDocument();
  });

  it('saves the current prompt under the name typed, on Enter', async () => {
    const user = userEvent.setup();
    const props = renderMenus();
    await user.click(screen.getByRole('button', { name: 'pipeline.templates.save' }));
    const field = screen.getByRole('textbox', { name: 'pipeline.templates.namePlaceholder' });
    fireEvent.change(field, { target: { value: 'Mio modello' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.saveTemplate).toHaveBeenCalledWith('Mio modello', 'testo attuale', 'stage', 'translation', undefined, undefined);
  });
});
