import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditPromptEditor } from './AuditPromptEditor';

const renderEditor = (props: Partial<Parameters<typeof AuditPromptEditor>[0]> = {}) =>
  render(
    <AuditPromptEditor
      label="Prompt"
      hint=""
      value="custom text"
      placeholder=""
      templates={[]}
      isRefining={false}
      canRefine
      refineLabel="model"
      onRefine={vi.fn()}
      onChange={vi.fn()}
      onApplyTemplate={vi.fn()}
      saveTemplate={vi.fn()}
      defaultValue="default text"
      onReset={vi.fn()}
      {...props}
    />,
  );

describe('AuditPromptEditor', () => {
  it('turns edit and reset off, with the reason, when editing is blocked', () => {
    renderEditor({ editDisabledReason: 'translations exist' });
    const blocked = screen.getAllByRole('button', { name: 'transcription.commandBlocked' });
    expect(blocked).toHaveLength(2);
    blocked.forEach((button) => expect(button).toBeDisabled());
  });

  it('marks a prompt different from the default with the custom label', () => {
    renderEditor({ customLabel: 'Personalizzata' });
    expect(screen.getByText('Personalizzata')).toBeInTheDocument();
  });
});
