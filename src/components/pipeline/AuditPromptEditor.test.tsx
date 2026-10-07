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

  it('says whether the prompt is custom, the default or a saved template', () => {
    const { unmount } = renderEditor();
    expect(screen.getByText('pipeline.promptSource.custom')).toBeInTheDocument();
    unmount();
    renderEditor({ value: 'default text' });
    expect(screen.getByText('pipeline.promptSource.default')).toBeInTheDocument();
  });

  it('names the saved template whose text is in use', () => {
    renderEditor({ templates: [{ id: 't1', name: 'OCR v2', prompt: 'custom text', context: 'ocr', workflow: 'transcription', createdAt: '' }] });
    expect(screen.getByText('pipeline.promptSource.template')).toBeInTheDocument();
  });
});
